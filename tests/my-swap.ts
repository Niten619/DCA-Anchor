import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { DcaAnchor } from "../target/types/dca_anchor";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { 
    createSerumMarket, 
    getAssociatedPoolKeys, 
    getMarket, 
    getVaultOwnerAndNonce, 
    sleep, 
    getMintDecimals,
    getFilteredTokenAccountsByOwner,
    getBigNumber,
    createAssociatedTokenAccountIfNotExist,
    sendTx,
    getTokenAccountsByOwner
 } from "./utils";
import { readFileSync } from "fs";
import { findProgramAddress } from "@raydium-io/raydium-sdk/src/common";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { publicKey } from "@raydium-io/raydium-sdk/src/marshmallow";
import { BN } from "bn.js";
import { assert } from "chai";
import { Liquidity, WSOL, SPL_ACCOUNT_LAYOUT, Spl, TokenAmount, Token } from "@raydium-io/raydium-sdk";
import {BigNumber} from "bignumber.js";
import { closeAccount, initializeAccount } from "@project-serum/serum/lib/token-instructions";
import { findPoolIdByBaseAndQuoteMintDevnet, fetchAllPoolKeys } from "../zapp_mvp_utils/raydium/liquidity-util";

describe("Nick Ko Test", () => {
const provider = anchor.AnchorProvider.env()
const conn = provider.connection;
const program = anchor.workspace.DcaAnchor as Program<DcaAnchor>;
anchor.setProvider(provider);

const wallet_1_path = __dirname + '/../test_wallets/wallet_1.json'
const wallet_1 = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(wallet_1_path, "utf-8")))
    );
console.log("wallet_1 pubkey:", wallet_1.publicKey.toBase58())
const test_wallet_path = __dirname + '/../test_wallets/VLTQv5rvWFmT9Rt5BenjSM9L9ttEZeVXrP4fna7Pxs1.json'
const dca_account = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(test_wallet_path, "utf-8")))
    );
console.log("dca_account pubkey:", dca_account.publicKey.toBase58())
const my_market_path = __dirname + '/../my_market/Mktt5yeBNgGqnDTXTwiHguiid7WrPT7iqZesv17pJAC.json'
const my_market_kp = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(my_market_path, "utf-8")))
    );
console.log("my_market_kp address:", my_market_kp.publicKey.toBase58())

const USDCSaberToken="2tWC4JAdL4AxEFJySziYJfsAnW2MHKRo98vbAPiRDSk8" // USD Coin (Saber Devnet)
const customToken = "AbLrwXbefZiLccVfdCSYmzzB7ftWf2XAhLtPdDnREbHe"
const solWrapmint="So11111111111111111111111111111111111111112" // WrappedSOL

// const VVSToken = "5s7oAh76gkfFR1DUsHxoKSG5kWoyq8Z25tkeByGMToZL";
// const USDCToken = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
// const serumMarketSecret =
//   "5nDxffSdK1ndx5X54cYHTQioHL4uYfNXsmCa11BN43aaTEP1Sn73eJ3KTUAE3aaZ24d9cStN7ciMTD5RQmaN1JzM";
// vvs-usdc serumMarket pubkey: UoQgfe8WuHb6eExigt8dtHfbgNKka4nRZxRHsCYK7Sq
// const vvs_market = Keypair.fromSecretKey(bs58.decode(serumMarketSecret));
// console.log("vvs_market pubkey:", vvs_market.publicKey.toBase58())

const new_market_kp = Keypair.generate();
console.log("new_market_kp pubkey:", new_market_kp.publicKey.toBase58())

const marketInfo = {
  serumDexProgram: new PublicKey(
    "DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY"
  ),
  ammProgram: new PublicKey("9rpQHSyFVM1dkkHFQ2TtTzPEW7DVmEyPmN8wVniqJtuC"),
  // serumMarket: my_market_kp,
  serumMarket: new_market_kp,
};
const serumMarketId = marketInfo.serumMarket.publicKey.toString();

const tokenAMintAddress = new PublicKey(solWrapmint);
const tokenBMintAddress = new PublicKey(customToken);
// const tokenBMintAddress = new PublicKey(USDCSaberToken);

it("swap test!", async () => {
// const poolKeysList = await fetchAllPoolKeys(conn);
// console.log("poolKeysList:", poolKeysList)

// const mero_pool = await findPoolIdByBaseAndQuoteMintDevnet(
//   conn,
//   "64JxKkSGUdgz26be8VYySDZQeWJQPwhdd44oCVSRZrA",
//   "4QSJaCvjL3iWw7scbfPR7utJTApkMUtjgUHneaRJD7p8"
// );
// console.log("mero_pool:", mero_pool)

// create serum market
const createMarketInfo = await createSerumMarket({
    connection: provider.connection,
    wallet: provider.wallet,
    baseMint: tokenAMintAddress,
    quoteMint: tokenBMintAddress,
    baseLotSize: 1,
    quoteLotSize: 1,
    dexProgram: marketInfo.serumDexProgram,
    market: marketInfo.serumMarket,
  });
  console.log(JSON.stringify(createMarketInfo, null, 2));

  // get serum market info
  const market = await getMarket(
    conn,
    serumMarketId,
    marketInfo.serumDexProgram.toString()
  );
  console.log("serum market info:", JSON.stringify(market, null, 2));
  console.log("market.address:", market.address.toBase58())

  const { vaultOwner, vaultNonce } = await getVaultOwnerAndNonce(
    new PublicKey(serumMarketId),
    marketInfo.serumDexProgram
  );

  const poolKeys = await getAssociatedPoolKeys({
    programId: marketInfo.ammProgram,
    serumProgramId: marketInfo.serumDexProgram,
    marketId: market.address,
    baseMint: market.baseMint,
    quoteMint: market.quoteMint,
  });
  console.log("amm poolKeys: ", JSON.stringify(poolKeys, null, 2));

  // RIGHTNOW KO KURA =========================================

  // Transaction Instruction for Creating a Raydium Pool
  const tnx = new Transaction().add(
    Liquidity.makeCreatePoolInstructionV4({
    poolKeys,
    userKeys:{payer: wallet_1.publicKey}
  }))
  console.log('create raydium pool accounts ...')
  await sendTx(conn, tnx, [wallet_1] )

  // Transaction Instruction for Initializing Raydium Pool
  const tokenAccounts = await getTokenAccountsByOwner(conn, wallet_1.publicKey)
  console.log("tokenAccounts:", tokenAccounts)
  const {transaction, signers} = await Liquidity.makeInitPoolTransaction({
    connection: conn,
    poolKeys: poolKeys,
    userKeys:{
      tokenAccounts: tokenAccounts, 
      owner: wallet_1.publicKey, 
    },
    baseAmount: new TokenAmount(new Token(market.baseMint.toString(), 9), 1, false),
    quoteAmount: new TokenAmount(new Token(market.quoteMint.toString(), 9), 2, false),
  })
  console.log('init raydium pool ...')
  await sendTx(conn, transaction, [wallet_1, ...signers])

  // Liquidity Pool for WSOL-CustomToken (AbLrwXbefZiLccVfdCSYmzzB7ftWf2XAhLtPdDnREbHe)
  const POOL_ID_OURS = "FrZDw3Nw91mwQkb7GWsbyEdsbnM89gNbyyYQYqvyhF8A"
  // from https://github.com/raydium-io/raydium-sdk/blob/master/test/liquidity/liquidity.test.ts
  // const config = {
  //   id: "GxQH8eyTk8geGDY2Zb42U9AGyrkyyrZjMYCWx3Q5U3Bg",
  //   baseMint: "So11111111111111111111111111111111111111112",
  //   quoteMint: "AbLrwXbefZiLccVfdCSYmzzB7ftWf2XAhLtPdDnREbHe",
  //   lpMint: "AYxwQ7897LcipNSBSgbr8FexapymraEcvxm9n9ZYBHos",
  //   version: 4,
  //   programId: "9rpQHSyFVM1dkkHFQ2TtTzPEW7DVmEyPmN8wVniqJtuC",
  //   authority: "DhVpojXMTbZMuTaCgiiaFU7U8GvEEhnYo4G9BUdiEYGh",
  //   openOrders: "2BkKS4bRMrVKSo3TGJm9miFbRBns7RhK7LsrhVGdF7ya",
  //   targetOrders: "HcTfrCDr4ywQ6WqLXTxUgbegnKz6eDbcRxgkuMdqYeKn",
  //   baseVault: "6gHcHUUbfxPQetoqRh4fiEm15Cux1TUpbJvDdEtC7iHe",
  //   quoteVault: "ArEzLEhoYss3Wbgqf7caqaGBehv9opSEF12Fq6TMy56A",
  //   withdrawQueue: "26zTXbm7SKQcubeCiaZBS43drJYivQyzfQB5uiyNBqHD",
  //   lpVault: "Bzm4RYGjfhSpkPmYiDndfAQqjGuz2FpQxUJgLF8ffALa",
  //   marketVersion: 3,
  //   marketProgramId: "DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY",
  //   marketId: "GeUkKup8yoxsHhDkTxiLRHbcWVFMopjSb7PTTREFdxkP",
  //   marketAuthority: "H32Ye8jCkpHWppic4U2UDzkdjq4QeYQH4LsYXhew4G4H",
  //   marketBaseVault: "36c6YqAwyGKQG66XEp2dJc5JqjaBNv7sVghEtJv4c7u6",
  //   marketQuoteVault: "8CFo8bL8mZQK8abbFyypFMwEDd8tVJjHTTojMLgQTUSZ",
  //   marketBids: "14ivtgssEBoBjuZJtSAPKYgpUK7DmnSwuPMqJoVTSgKJ",
  //   marketAsks: "CEQdAFKdycHugujQg9k2wbmxjcpdYZyVLfV9WerTnafJ",
  //   marketEventQueue: "5KKsLVU6TcbVDK4BS6K1DGDxnh4Q9xjYJ8XaDCG5t8ht",
  // };
  // const poolKeys_configured = jsonInfo2PoolKeys(config);
  // const poolInfo_configured = await Liquidity.fetchInfo({ conn, poolKeys_configured });

  const [vault_acc, _] = findProgramAddressSync(
        [wallet_1.publicKey.toBuffer(),
        dca_account.publicKey.toBuffer()],
        program.programId
    );
  console.log("vault_acc:", vault_acc.toBase58())

  const vault_ata = await getAssociatedTokenAddress(
    new PublicKey(USDCSaberToken),
    vault_acc,
    true  // this is "allowOwnerOffCurve" flag which is false by default
    );
  console.log("vault_ata:", vault_ata.toBase58())
  const vault_wrap_ata = await getAssociatedTokenAddress(
    new PublicKey(solWrapmint),
    vault_acc,
    true
    );
  console.log("vault_wrap_ata:", vault_wrap_ata.toBase58())

  // now make the actual call to the on-chain program
  const tx = await program.methods.swapFromSol(
    new BN(0.1 * LAMPORTS_PER_SOL), 
    new BN(0.1 * LAMPORTS_PER_SOL))
  .accounts({
    amm: poolKeys.id,
    ammAuthority: poolKeys.authority,
    ammOpenOrders: poolKeys.openOrders,
    ammTargetOrders: poolKeys.targetOrders,
    poolCoinTokenAccount: poolKeys.baseVault,
    poolPcTokenAccount: poolKeys.quoteVault,
    serumProgram: marketInfo.serumDexProgram,
    serumMarket: serumMarketId,
    serumBids: market.bids,
    serumAsks: market.asks,
    serumEventQueue: market.eventQueue,
    serumCoinVaultAccount: market.baseVault,
    serumPcVaultAccount: market.quoteVault,
    serumVaultSigner: vaultOwner,
    userSourceTokenAccount: vault_wrap_ata,
    userDestinationTokenAccount: vault_ata,
    userSourceOwner: vault_acc,  // vault_acc maybe?
    splTokenProgram: TOKEN_PROGRAM_ID,
    dcaAccount: dca_account.publicKey,
    senderAccount: wallet_1.publicKey,
    systemProgram: SystemProgram.programId
  }).signers([dca_account, wallet_1])
  .rpc();
  console.log("Your transaction signature", tx);







  // Custom PoolKeys
  // const LIQUIDITY_PROGRAM_ID_V4 = new PublicKey('9rpQHSyFVM1dkkHFQ2TtTzPEW7DVmEyPmN8wVniqJtuC')
  // const SERUM_PROGRAM_ID_V3 = new PublicKey('DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY')
  // const seedParam = {programId: LIQUIDITY_PROGRAM_ID_V4, marketId: market.address}
  // const {publicKey, nonce} = Liquidity.getAssociatedAuthority({programId:LIQUIDITY_PROGRAM_ID_V4})
  // console.log("publicKey:", publicKey.toBase58())

//   const poolKeys = {
//       id: await Liquidity.getAssociatedId(seedParam),
//       baseMint: tokenAMintAddress,
//       quoteMint: tokenBMintAddress,
//       lpMint: await Liquidity.getAssociatedLpMint(seedParam),
//       baseDecimals: 9,
//       quoteDecimals: 9,
//       lpDecimals: 9,
//       version: 4,
//       programId: LIQUIDITY_PROGRAM_ID_V4,
//       authority: publicKey,
//       nonce, 
//       baseVault: await Liquidity.getAssociatedBaseVault(seedParam),
//       quoteVault: await Liquidity.getAssociatedQuoteVault(seedParam),
//       lpVault: await Liquidity.getAssociatedLpVault(seedParam),
//       openOrders: await Liquidity.getAssociatedOpenOrders(seedParam),
//       targetOrders: await Liquidity.getAssociatedTargetOrders(seedParam),
//       withdrawQueue: await Liquidity.getAssociatedWithdrawQueue(seedParam),
//       marketVersion: 3,
//       marketId: market.address,
//       marketProgramId: SERUM_PROGRAM_ID_V3,
//       marketAuthority: vaultOwner,
//     }
    // console.log("amm poolKeys: ", JSON.stringify(poolKeys, null, 2));


//   await createAtaAndMinto(connection, baseCoin, quoteCoin, vault_keypair);

/************************************ initialize test ***************************************/
    // const userInputBaseValue = 1;
    // const userInputQuoteValue = 1000;
    // const poolCoinTokenAccount = poolKeys.baseVault;
    // const poolPcTokenAccount = poolKeys.quoteVault;
    // const lpMintAddress = poolKeys.lpMint;

    // await initAmm(
    // conn,
    // provider,
    // market,
    // userInputBaseValue,
    // userInputQuoteValue,
    // poolCoinTokenAccount,
    // poolPcTokenAccount,
    // lpMintAddress
    // );
    // console.log("Finished Initializing!!")
    // assert(false)

//   const [vault_acc, _] = findProgramAddressSync(
//     [wallet_1.publicKey.toBuffer(),
//     dca_account.publicKey.toBuffer()],
//     program.programId
//     );
//     console.log("vault_acc:", vault_acc.toBase58())

//   const vault_ata = await getAssociatedTokenAddress(
//     new PublicKey(USDCSaberToken),
//     vault_acc,
//     true  // this is "allowOwnerOffCurve" flag which is false by default
//     );
//     console.log("vault_ata:", vault_ata.toBase58())
//   const vault_wrap_ata = await getAssociatedTokenAddress(
//     new PublicKey(solWrapmint),
//     vault_acc,
//     true
//     );
//     console.log("vault_wrap_ata:", vault_wrap_ata.toBase58())

//   const ammProgram = marketInfo.ammProgram;
//   const amm = poolKeys.id;
//   const ammAuthority = poolKeys.authority;
//   const ammOpenOrders = poolKeys.openOrders;
//   const ammTargetOrders = poolKeys.targetOrders;
//   const poolCoinTokenAccount = poolKeys.baseVault;
//   const poolPcTokenAccount = poolKeys.quoteVault;
//   const serumProgram = marketInfo.serumDexProgram;
//   const serumMarket = serumMarketId;
//   const serumBids = market.bids;
//   const serumAsks = market.asks;
//   const serumEventQueue = market.eventQueue;
//   const serumCoinVaultAccount = market.baseVault;
//   const serumPcVaultAccount = market.quoteVault;
//   const serumVaultSigner = vaultOwner;
//   const userSourceTokenAccount = vault_wrap_ata;
//   const userDestinationTokenAccount = vault_ata;
//   const userSourceOwner = vault_acc;

//   // now make the actual call to the on-chain program
//   console.log("Calling on-chain program")
//   const tx = await program.methods.swapFromSol(
//     new BN(1 * LAMPORTS_PER_SOL), 
//     new BN(1 * LAMPORTS_PER_SOL)
//   ).accounts({
//     amm: amm,
//     ammAuthority: ammAuthority,
//     ammOpenOrders: ammOpenOrders,
//     ammTargetOrders: ammTargetOrders,
//     poolCoinTokenAccount: poolCoinTokenAccount,
//     poolPcTokenAccount: poolPcTokenAccount,
//     serumProgram: serumProgram,
//     serumMarket: serumMarket,
//     serumBids: serumBids,
//     serumAsks: serumAsks,
//     serumEventQueue: serumEventQueue,
//     serumCoinVaultAccount: serumCoinVaultAccount,
//     serumPcVaultAccount: serumPcVaultAccount,
//     serumVaultSigner: serumVaultSigner,
//     userSourceTokenAccount: userSourceTokenAccount,
//     userDestinationTokenAccount: userDestinationTokenAccount,
//     userSourceOwner: userSourceOwner,
//     splTokenProgram: TOKEN_PROGRAM_ID,
//     dcaAccount: dca_account.publicKey,
//     senderAccount: wallet_1.publicKey,
//     systemProgram: SystemProgram.programId
//   }).signers([dca_account, wallet_1])
//   .rpc();

//   console.log("Your transaction signature", tx);

});

async function initAmm(
    conn: any,
    provider: anchor.Provider,
    market: any,
    userInputBaseValue: number,
    userInputQuoteValue: number,
    poolCoinTokenAccount: PublicKey,
    poolPcTokenAccount: PublicKey,
    lpMintAddress: PublicKey
  ) {
    const baseMintDecimals = new BigNumber(
      await getMintDecimals(conn, market.baseMintAddress as PublicKey)
    );
    const quoteMintDecimals = new BigNumber(
      await getMintDecimals(conn, market.quoteMintAddress as PublicKey)
    );
    const coinVol = new BigNumber(10)
      .exponentiatedBy(baseMintDecimals)
      .multipliedBy(userInputBaseValue);
    const pcVol = new BigNumber(10)
      .exponentiatedBy(quoteMintDecimals)
      .multipliedBy(userInputQuoteValue);
  
    const transaction = new Transaction();
    const signers: any = [];
    const owner = provider.wallet.publicKey;
    const baseTokenAccount = await getFilteredTokenAccountsByOwner(
      conn,
      owner,
      market.baseMintAddress
    );
    const quoteTokenAccount = await getFilteredTokenAccountsByOwner(
      conn,
      owner,
      market.quoteMintAddress
    );
    const baseTokenList: any = baseTokenAccount.value.map((item: any) => {
      if (
        item.account.data.parsed.info.tokenAmount.amount >= getBigNumber(coinVol)
      ) {
        return item.pubkey;
      }
      return null;
    });
    const quoteTokenList: any = quoteTokenAccount.value.map((item: any) => {
      if (
        item.account.data.parsed.info.tokenAmount.amount >= getBigNumber(pcVol)
      ) {
        return item.pubkey;
      }
      return null;
    });
    let baseToken: string | null = null;
    for (const item of baseTokenList) {
      if (item !== null) {
        baseToken = item;
      }
    }
    let quoteToken: string | null = null;
    for (const item of quoteTokenList) {
      if (item !== null) {
        quoteToken = item;
      }
    }
    if (
      (baseToken === null && market.baseMintAddress.toString() !== WSOL.mint) ||
      (quoteToken === null && market.quoteMintAddress.toString() !== WSOL.mint)
    ) {
      throw new Error("no money");
    }
  
    const destLpToken: PublicKey = await createAssociatedTokenAccountIfNotExist(
      owner,
      lpMintAddress,
      transaction,
      conn
    );
  
    if (market.baseMintAddress.toString() === WSOL.mint) {
      const newAccount = new Keypair();
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: newAccount.publicKey,
          lamports: parseInt(coinVol.toFixed()) + 1e7,
          space: SPL_ACCOUNT_LAYOUT.span,
          programId: TOKEN_PROGRAM_ID,
        })
      );
      transaction.add(
        initializeAccount({
          account: newAccount.publicKey,
          mint: new PublicKey(WSOL.mint),
          owner,
        })
      );
  
      transaction.add(
        Spl.makeTransferInstruction({
          source: newAccount.publicKey,
          destination: poolCoinTokenAccount,
          owner: owner,
          amount: parseInt(coinVol.toFixed()),
        })
      );
  
      transaction.add(
        closeAccount({
          source: newAccount.publicKey,
          destination: owner,
          owner,
        })
      );
  
      signers.push(newAccount);
    } else {
      transaction.add(
        Spl.makeTransferInstruction({
          source: new PublicKey(baseToken),
          destination: poolCoinTokenAccount,
          owner: owner,
          amount: parseInt(coinVol.toFixed()),
        })
      );
    }
    if (market.quoteMintAddress.toString() === WSOL.mint) {
      const newAccount = new Keypair();
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: newAccount.publicKey,
          lamports: parseInt(pcVol.toFixed()) + 1e7,
          space: SPL_ACCOUNT_LAYOUT.span,
          programId: TOKEN_PROGRAM_ID,
        })
      );
      transaction.add(
        initializeAccount({
          account: newAccount.publicKey,
          mint: new PublicKey(WSOL.mint),
          owner,
        })
      );
      transaction.add(
        Spl.makeTransferInstruction({
          source: newAccount.publicKey,
          destination: poolPcTokenAccount,
          owner: owner,
          amount: parseInt(pcVol.toFixed()),
        })
      );
  
      transaction.add(
        closeAccount({
          source: newAccount.publicKey,
          destination: owner,
          owner,
        })
      );
      signers.push(newAccount);
    } else {
      transaction.add(
        Spl.makeTransferInstruction({
          source: new PublicKey(quoteToken),
          destination: poolPcTokenAccount,
          owner: owner,
          amount: parseInt(pcVol.toFixed()),
        })
      );
    }
  
    const txid = await provider.send(transaction, signers, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });
    console.log("initAMM txid:", txid);
    sleep(3000);
    // checkTxid(conn, txid)
  }

});