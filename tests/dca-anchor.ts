import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, createMintToInstruction, getAssociatedTokenAddress, MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Signer, SystemProgram, Transaction } from "@solana/web3.js";
import { BN } from "bn.js";
import { DcaAnchor } from "../target/types/dca_anchor";
import { readFileSync } from "fs";
import bs58 from "bs58";
import { Coin, Dex } from "@project-serum/serum-dev-tools";
import {
  createAssociatedTokenAccountIfNotExist,
  createAtaAndMinto,
  createMintPair,
  createSerumMarket,
  fetchPoolKeys,
  getAssociatedPoolKeys,
  getBigNumber,
  getFilteredTokenAccountsByOwner,
  getLiquidityInfo,
  getMarket,
  getMintDecimals,
  getTokenAccountsByOwner,
  getVaultOwnerAndNonce,
  sendTx,
  sleep,
  swap,
} from "./utils";
import { 
  Liquidity, 
  LiquidityPoolKeys, 
  LIQUIDITY_STATE_LAYOUT_V4, 
  Market, 
  Percent, 
  SPL_ACCOUNT_LAYOUT, 
  Token, 
  TokenAccount, 
  TokenAmount 
} from "@raydium-io/raydium-sdk";
import { OpenOrders } from "@project-serum/serum";
import { assert } from "chai";

describe("dca-anchor", async () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  const connection = provider.connection;
  const wallet = provider.wallet;
  anchor.setProvider(provider);
  const program = anchor.workspace.DcaAnchor as Program<DcaAnchor>;

  const test_wallet_path = __dirname + '/../test_wallets/VLTQv5rvWFmT9Rt5BenjSM9L9ttEZeVXrP4fna7Pxs1.json'
  const wallet_1_path = __dirname + '/../test_wallets/wallet_1.json'
  const vault_path = __dirname + '/../test_wallets/VTdnZ6vsjr2N3Etd59vqw9mDQCb2SxpUARTY8hzDYXT.json'
  const dca_account = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(test_wallet_path, "utf-8")))
    );
  console.log("dca_account pubkey:", dca_account.publicKey.toBase58())
  const wallet_1 = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(wallet_1_path, "utf-8")))
    );
  console.log("wallet_1 pubkey:", wallet_1.publicKey.toBase58())
  const vault_keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(vault_path, "utf-8")))
    );
  console.log("vault pubkey:", vault_keypair.publicKey.toBase58())

  /** The devnet raydium liquidity pool program v4 id. 
   * For a Liquidity Pool, 752 bytes is allocated and Assigned ProgID is this program id '9rpQHS....' */
  const LIQUIDITY_PROGRAM_ID_V4 = new PublicKey('9rpQHSyFVM1dkkHFQ2TtTzPEW7DVmEyPmN8wVniqJtuC')

  /** The devnet serum market program id. 
   * For a Serum Market, 388 bytes is allocated and Assigned ProgID is this program id 'DESVgJ....' */
  const SERUM_PROGRAM_ID_V3 = new PublicKey('DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY')

  // let dca_account = Keypair.generate();
  // let dca_account = new PublicKey("8cBeHtYPeEN2pUqRL6a76qScyU6ah6cJdVWjvEhLQ9in");
  // console.log("dca_account pubkey:", dca_account.publicKey.toBase58())
  // let mintAddress = new PublicKey("2tWC4JAdL4AxEFJySziYJfsAnW2MHKRo98vbAPiRDSk8")  // USD Coin(Saber Devnet)
  let mintAddress = new PublicKey("AbLrwXbefZiLccVfdCSYmzzB7ftWf2XAhLtPdDnREbHe")  // Custom Token Mint
  let solWrapmint = new PublicKey("So11111111111111111111111111111111111111112")

  // generate a new keypair for the mint account (Note: This is the token that will be created)
  // const mint_keypair = anchor.web3.Keypair.generate();
  // console.log("Mint pubkey:", mint_keypair.publicKey.toString())

  const [vault_acc, _] = findProgramAddressSync(
    [wallet_1.publicKey.toBuffer(),
    dca_account.publicKey.toBuffer()],
    program.programId
  );
  console.log("vault_acc:", vault_acc.toBase58())
  const sender_ata = await getAssociatedTokenAddress(
    mintAddress,
    wallet_1.publicKey
  );
  console.log("sender_ata:", sender_ata.toBase58())
  // const sender_custom_mint_ata = await getAssociatedTokenAddress(
  //   mint_keypair.publicKey,
  //   wallet_1.publicKey
  // );
  // console.log("sender_custom_mint_ata:", sender_custom_mint_ata.toBase58())
  const vault_ata = await getAssociatedTokenAddress(
    mintAddress,
    vault_acc,
    true  // this is "allowOwnerOffCurve" flag which is false by default
  );
  console.log("vault_ata:", vault_ata.toBase58())
  const vault_wrap_ata = await getAssociatedTokenAddress(
    solWrapmint,
    vault_acc,
    true
  );
  console.log("vault_wrap_ata:", vault_wrap_ata.toBase58())

  // it("Deposit Sol!", async () => {  
    // instructions
    // const sender_ata_inx = createAssociatedTokenAccountInstruction(
    //   wallet_1.publicKey,
    //   sender_ata,
    //   wallet_1.publicKey,
    //   mintAddress
    // );
    // const vault_ata_inx = createAssociatedTokenAccountInstruction(
    //   wallet_1.publicKey,
    //   vault_ata,
    //   vault_acc,
    //   mintAddress
    // );
    // const vault_wrap_ata_inx = createAssociatedTokenAccountInstruction(
    //   wallet_1.publicKey,
    //   vault_wrap_ata,
    //   vault_acc,
    //   solWrapmint
    // );
    // // transaction
    // const tnx = new anchor.web3.Transaction().add(
    //   sender_ata_inx,
    //   vault_ata_inx,
    //   vault_wrap_ata_inx
    // );
    
    // // send and confirm
    // const tnx_sig = await anchor.AnchorProvider.env().sendAndConfirm(
    //   tnx,
    //   [wallet_1],
    //   {preflightCommitment: "confirmed"}
    // );
    // console.log("tnx_sig:", tnx_sig)
    
    // now make the actual call to the on-chain program
  //   const tx = await program.methods.depositSol(
  //     new BN(1 * LAMPORTS_PER_SOL)
  //   ).accounts({
  //     dcaAccount: dca_account.publicKey,
  //     senderAccount: wallet_1.publicKey,
  //     vault: vault_acc,
  //     tokenProgram: TOKEN_PROGRAM_ID,
  //     tokenMint: mintAddress,
  //     tokenMintWrap: solWrapmint,
  //     systemProgram: SystemProgram.programId,
  //     senderAta: sender_ata,
  //     vaultTokenAta: vault_ata,
  //     vaultWrapAta: vault_wrap_ata,
  //     associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
  //   }).signers([dca_account, wallet_1])
  //   .rpc();
  //   console.log("Your transaction signature", tx);
  // });

  // it("Deposit Token!", async () => {
    // // instruction for creating associated token account
    // const sender_custom_mint_ata_inx = createAssociatedTokenAccountInstruction(
    //     wallet_1.publicKey,
    //     sender_custom_mint_ata,
    //     wallet_1.publicKey,
    //     mint_keypair.publicKey
    //   );
    // const vault_custom_mint_ata_inx = createAssociatedTokenAccountInstruction(
    //     wallet_1.publicKey,
    //     vault_ata,
    //     vault_acc,
    //     mintAddress
    //   );
    // // instruction for creating an account (mint account in this case)
    // const mint_acc_inx = anchor.web3.SystemProgram.createAccount({
    //   fromPubkey: wallet_1.publicKey,
    //   newAccountPubkey: mint_keypair.publicKey,
    //   lamports: await connection.getMinimumBalanceForRentExemption(MintLayout.span),
    //   space: MintLayout.span,
    //   programId: TOKEN_PROGRAM_ID
    // });
    // // instruction for initializing the mint account
    // const mint_acc_init_inx = createInitializeMintInstruction(
    //   mint_keypair.publicKey,
    //   9,
    //   wallet_1.publicKey,
    //   wallet_1.publicKey
    // );
    // // instruction for minting 100 tokens into wallet_1's ata
    // console.log("Forming instruction for minting 100 tokens into", wallet_1.toString())
    // const mint_token_inx = createMintToInstruction(
    //     mint_keypair.publicKey,
    //     sender_custom_mint_ata,
    //     wallet_1.publicKey,
    //     100_000_000_000
    // );
    // // add these inx into a transaction and send
    // const tnx = new anchor.web3.Transaction().add(
    //   mint_acc_inx,
    //   mint_acc_init_inx,
    //   sender_custom_mint_ata_inx,
    //   vault_custom_mint_ata_inx,
    //   mint_token_inx
    // );
    // const tnx_sign = await anchor.AnchorProvider.env().sendAndConfirm(
    //     tnx,
    //     [mint_keypair, wallet_1],
    //     {preflightCommitment: "confirmed"}
    // );
    // console.log("tnx signature:", tnx_sign)

      // now make the actual call to the on-chain program
    // const tx = await program.methods.depositToken(
    //   new BN(10 * LAMPORTS_PER_SOL)
    // ).accounts({
    //   senderAccount: wallet_1.publicKey,
    //   dcaAccount: dca_account.publicKey,
    //   vault: vault_acc,
    //   tokenProgram: TOKEN_PROGRAM_ID,
    //   tokenMint: mintAddress,
    //   tokenMintWrap: solWrapmint,
    //   systemProgram: SystemProgram.programId,
    //   senderAta: sender_ata,
    //   vaultTokenAta: vault_ata,
    //   vaultWrapAta: vault_wrap_ata,
    //   associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    // }).signers([dca_account, wallet_1])
    // .rpc();
    // console.log("Your transaction signature", tx);
  // });

  it("Swap From WSOL!", async () => {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const dex = new Dex(SERUM_PROGRAM_ID_V3, connection);
    const baseCoin = await dex.createCoin(
      "WSOL",
      9,
      vault_keypair,
      vault_keypair,
      vault_keypair
    );
    const quoteCoin = await dex.createCoin(
      "USDN",
      9,
      vault_keypair,
      vault_keypair,
      vault_keypair
    );
    console.log("baseCoin:", baseCoin)
    console.log("quoteCoin:", quoteCoin)

    const market = await dex.initDexMarket(vault_keypair, baseCoin, quoteCoin, {
      lotSize: 1e-3,
      tickSize: 1e-2,
    });

    const {vaultOwner} = await getVaultOwnerAndNonce(market.address, SERUM_PROGRAM_ID_V3)
    console.log(`Created ${market.marketSymbol} market @ ${market.address.toString()},  vaultOwner ${vaultOwner.toString()}`);

    const seedParam = {programId: LIQUIDITY_PROGRAM_ID_V4, marketId: market.address}
    const {publicKey, nonce} = Liquidity.getAssociatedAuthority({programId:LIQUIDITY_PROGRAM_ID_V4})
    console.log("publicKey:", publicKey.toBase58())

    const poolKeys = {
      id: Liquidity.getAssociatedId(seedParam),
      baseMint: baseCoin.mint,
      quoteMint: quoteCoin.mint,
      lpMint: Liquidity.getAssociatedLpMint(seedParam),
      baseDecimals: 9,
      quoteDecimals: 9,
      lpDecimals: 9,
      version: 4,
      programId: LIQUIDITY_PROGRAM_ID_V4,
      authority: publicKey,
      nonce, 
      baseVault: Liquidity.getAssociatedBaseVault(seedParam),
      quoteVault: Liquidity.getAssociatedQuoteVault(seedParam),
      lpVault: Liquidity.getAssociatedLpVault(seedParam),
      openOrders: Liquidity.getAssociatedOpenOrders(seedParam),
      targetOrders: Liquidity.getAssociatedTargetOrders(seedParam),
      withdrawQueue: Liquidity.getAssociatedWithdrawQueue(seedParam),
      marketVersion: 3,
      marketId: market.address,
      marketProgramId: SERUM_PROGRAM_ID_V3,
      marketAuthority: vaultOwner,
    }
    console.log("amm poolKeys: ", JSON.stringify(poolKeys, null, 2));

    /**
     * We need to create Token Accounts into which we have the authority to mint
     * baseMint(token) and quoteMint(token) so that later we could supply these
     * two tokens into the Liquidity Pool during raydium pool initialization step
     */
    await createAtaAndMinto(connection, baseCoin, quoteCoin, vault_keypair);

    // Transaction Instruction for Creating a Raydium Pool
    const tnx = new Transaction().add(
      Liquidity.makeCreatePoolInstructionV4({
      poolKeys,
      userKeys:{payer: vault_keypair.publicKey}
    }))
    console.log('create raydium pool accounts ...')
    await sendTx(connection, tnx, [vault_keypair] )

    // Transaction Instruction for Initializing Raydium Pool
    const tokenAccounts = await getTokenAccountsByOwner(connection, vault_keypair.publicKey)
    console.log("tokenAccounts:", tokenAccounts)
    const {transaction, signers} = await Liquidity.makeInitPoolTransaction({
      connection: connection,
      poolKeys: poolKeys,
      userKeys:{
        tokenAccounts: tokenAccounts, 
        owner: vault_keypair.publicKey, 
      },
      baseAmount: new TokenAmount(new Token(baseCoin.mint.toString(), baseCoin.decimals), 1, false),
      quoteAmount: new TokenAmount(new Token(quoteCoin.mint.toString(), quoteCoin.decimals), 2, false),
    })
    console.log('init raydium pool ...')
    await sendTx(connection, transaction, [vault_keypair, ...signers])

    //** SWAPPING PART */
    // const tokenAccounts = await getTokenAccountsByOwner(connection, vault_keypair.publicKey)
    // console.log("tokenAccounts:", tokenAccounts.length)
    // const POOL_ID = "GNxTqYbGacH5MEsNVtBqGYYCCNeu57vWBLq1dDkkL49h"  // WSOL-USDN pool
    // const poolKeyss = await fetchPoolKeys(connection, new PublicKey(POOL_ID))
    // console.log("amm poolKeys: ", JSON.stringify(poolKeyss, null, 2));
    // const info = await getLiquidityInfo(connection, new PublicKey(POOL_ID), SERUM_PROGRAM_ID_V3)
    // console.log("base Vault:", info.baseVaultKey.toBase58(), info.baseVaultBalance);
    // console.log("quote Vault:", info.quoteVaultKey.toBase58(), info.quoteVaultBalance);
    // console.log(`openOrders Account ${info.openOrdersKey.toBase58()}, base Serum book total: ${info.openOrdersTotalBase}, quote Serum book total: ${info.openOrdersTotalQuote} `)
    // console.log(`base pnl: ${info.basePnl }, quote pnl: ${info.quotePnl}` );
    // console.log(`Final base:${info.base}, quote:${info.quote}, priceInQuote: ${info.priceInQuote}, lpSupply:${info.lpSupply}` )

    // await swap(connection, poolKeyss, vault_keypair, tokenAccounts)










    // const serumMarketSecret =
    // "5nDxffSdK1ndx5X54cYHTQioHL4uYfNXsmCa11BN43aaTEP1Sn73eJ3KTUAE3aaZ24d9cStN7ciMTD5RQmaN1JzM";
    // const marketInfo = {
    //   serumDexProgram: new PublicKey(
    //     "DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY"
    //   ),
    //   ammProgram: new PublicKey("9rpQHSyFVM1dkkHFQ2TtTzPEW7DVmEyPmN8wVniqJtuC"),
    //   serumMarket: Keypair.fromSecretKey(bs58.decode(serumMarketSecret)),
    // };

    // create serum market
    // console.log("Create Serum Market")
    // const createMarketInfo = await createSerumMarket({
    //   connection: provider.connection,
    //   wallet: provider.wallet,
    //   baseMint: solWrapmint,
    //   quoteMint: mintAddress,
    //   baseLotSize: 1,
    //   quoteLotSize: 1,
    //   dexProgram: marketInfo.serumDexProgram,
    //   market: marketInfo.serumMarket,
    // });
    // console.log(JSON.stringify(createMarketInfo));
    // // wait for transaction success
    // sleep(60000);

    // const serumMarketId = marketInfo.serumMarket.publicKey.toString();
    // get serum market info
    // const market = await getMarket(
    //   connection,
    //   serumMarketId,
    //   marketInfo.serumDexProgram.toString()
    // );
    // const poolKeys = await getAssociatedPoolKeys({
    //   programId: marketInfo.ammProgram,
    //   serumProgramId: marketInfo.serumDexProgram,
    //   marketId: market.address,
    //   baseMint: market.baseMint,
    //   quoteMint: market.quoteMint,
    // });
    // console.log("amm poolKeys: ", JSON.stringify(poolKeys, null, 2));

    // const { vaultOwner, vaultNonce } = await getVaultOwnerAndNonce(
    //   new PublicKey(serumMarketId),
    //   marketInfo.serumDexProgram
    // );

    // USER
    // const [vault_acc, _] = findProgramAddressSync(
    //   [wallet_1.publicKey.toBuffer(),
    //   dca_account.publicKey.toBuffer()],
    //   program.programId
    // );
    // console.log("vault_acc:", vault_acc.toBase58())
    // const vault_ata = await getAssociatedTokenAddress(
    //   mintAddress,
    //   vault_acc,
    //   true  // this is "allowOwnerOffCurve" flag which is false by default
    // );
    // console.log("vault_ata:", vault_ata.toBase58())
    // const vault_wrap_ata = await getAssociatedTokenAddress(
    //   solWrapmint,
    //   vault_acc,
    //   true
    // );
    // console.log("vault_wrap_ata:", vault_wrap_ata.toBase58())

    // now make the actual call to the on-chain program
    // const tx = await program.methods.swapFromSol(
    //   new BN(1 * LAMPORTS_PER_SOL), 
    //   new BN(1 * LAMPORTS_PER_SOL))
    // .accounts({
    //   ammProgram: marketInfo.ammProgram,
    //   amm: poolKeys.id,
    //   ammAuthority: poolKeys.authority,
    //   ammOpenOrders: poolKeys.openOrders,
    //   ammTargetOrders: poolKeys.targetOrders,
    //   poolCoinTokenAccount: poolKeys.baseVault,
    //   poolPcTokenAccount: poolKeys.quoteVault,
    //   serumProgram: marketInfo.serumDexProgram,
    //   serumMarket: serumMarketId,
    //   serumBids: market.bids,
    //   serumAsks: market.asks,
    //   serumEventQueue: market.eventQueue,
    //   serumCoinVaultAccount: market.baseVault,
    //   serumPcVaultAccount: market.quoteVault,
    //   serumVaultSigner: vaultOwner,
    //   userSourceTokenAccount: vault_wrap_ata,
    //   userDestinationTokenAccount: vault_ata,
    //   userSourceOwner: vault_acc,  // vault_acc maybe?
    //   splTokenProgram: TOKEN_PROGRAM_ID,
    //   dcaAccount: dca_account.publicKey,
    // })
    // .rpc();
    // console.log("Your transaction signature", tx);
  });
});
