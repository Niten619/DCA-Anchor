import {
    Account,
    Connection,
    Keypair,
    PublicKey,
    Signer,
    SystemProgram,
    Transaction,
    TransactionSignature
} from '@solana/web3.js'
import {ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createMint, createMintToInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import {DexInstructions, Market as MarketSerum, OpenOrders, TokenInstructions,} from '@project-serum/serum';
import {Liquidity, LiquidityPoolKeys, LIQUIDITY_STATE_LAYOUT_V4, Market as raydiumSerum, Percent, Spl, SPL_ACCOUNT_LAYOUT, SPL_MINT_LAYOUT, Token, TokenAccount, TokenAmount} from "@raydium-io/raydium-sdk";
import {LiquidityAssociatedPoolKeys} from "@raydium-io/raydium-sdk/src/liquidity"
import { readFileSync } from "fs";
import { Coin } from '@project-serum/serum-dev-tools';

const LIQUIDITY_PROGRAM_ID_V4 = new PublicKey('9rpQHSyFVM1dkkHFQ2TtTzPEW7DVmEyPmN8wVniqJtuC');
const SERUM_PROGRAM_ID_V3 = new PublicKey('DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY');

export async function getAssociatedPoolKeys({
                                                programId,
                                                serumProgramId,
                                                marketId,
                                                baseMint,
                                                quoteMint,
                                            }: {
    programId: PublicKey;
    serumProgramId: PublicKey;
    marketId: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
}): Promise<LiquidityAssociatedPoolKeys> {

    const id = await Liquidity.getAssociatedId({programId, marketId});
    const lpMint = await Liquidity.getAssociatedLpMint({programId, marketId});
    const {publicKey: authority, nonce} = await Liquidity.getAssociatedAuthority({programId});
    const baseVault = await Liquidity.getAssociatedBaseVault({programId, marketId});
    const quoteVault = await Liquidity.getAssociatedQuoteVault({programId, marketId});
    const lpVault = await Liquidity.getAssociatedLpVault({programId, marketId});
    const openOrders = await Liquidity.getAssociatedOpenOrders({programId, marketId});
    const targetOrders = await Liquidity.getAssociatedTargetOrders({programId, marketId});
    const withdrawQueue = await Liquidity.getAssociatedWithdrawQueue({programId, marketId});

    const {publicKey: marketAuthority} = await raydiumSerum.getAssociatedAuthority({
        programId: serumProgramId,
        marketId,
    });

    return {
        // base
        id,
        baseMint,
        quoteMint,
        lpMint,
        baseDecimals: 9,  // added
        quoteDecimals: 9, // added 
        lpDecimals: 9,    // added
        // version
        version: 4,
        programId,
        // keys
        authority,
        nonce,
        baseVault,
        quoteVault,
        lpVault,
        openOrders,
        targetOrders,
        withdrawQueue,
        // market version
        marketVersion: 4,
        marketProgramId: serumProgramId,
        // market keys
        marketId,
        marketAuthority,
    };
}

export async function createAssociatedTokenAccountIfNotExist(
    owner: PublicKey,
    mint: PublicKey,
    transaction: Transaction,
    conn: any,
) {
    const associatedAccount = await Spl.getAssociatedTokenAccount({mint, owner})
    const payer = owner
    const associatedAccountInfo = await conn.getAccountInfo(associatedAccount)
    if (!associatedAccountInfo) {
        transaction.add(Spl.makeCreateAssociatedTokenAccountInstruction({
                mint,
                associatedAccount,
                owner,
                payer
            })
        );
    }
    return associatedAccount
}


export async function sendTransaction(
    connection: Connection,
    wallet: any,
    transaction: Transaction,
    signers: Array<Account> = []
) {
    const txid: TransactionSignature = await wallet.sendTransaction(transaction, connection, {
        signers,
        skipPreflight: true,
        preflightCommitment: "confirmed"
    })

    return txid
}

export function getBigNumber(num: any) {
    return num === undefined || num === null ? 0 : parseFloat(num.toString())
}

export async function getMarket(conn: any, marketAddress: string, serumProgramId: string): Promise<Market> {
    try {
        const marketAddressPubKey = new PublicKey(marketAddress)
        const market = await Market.load(conn, marketAddressPubKey, undefined, new PublicKey(serumProgramId))
        return market
    } catch (error: any) {
        console.log("get market err: ", error)
        throw error;
    }
}

export class Market extends MarketSerum {
    public baseVault: PublicKey | null = null
    public quoteVault: PublicKey | null = null
    public requestQueue: PublicKey | null = null
    public eventQueue: PublicKey | null = null
    public bids: PublicKey | null = null
    public asks: PublicKey | null = null
    public baseLotSize: number = 0
    public quoteLotSize: number = 0
    // private _decoded: any
    public quoteMint: PublicKey | null = null
    public baseMint: PublicKey | null = null
    public vaultSignerNonce: Number | null = null

    static async load(connection: Connection, address: PublicKey, options: any = {}, programId: PublicKey) {
        const {owner, data} = throwIfNull(await connection.getAccountInfo(address), 'Market not found')
        if (!owner.equals(programId)) {
            throw new Error('Address not owned by program: ' + owner.toBase58())
        }
        const decoded = this.getLayout(programId).decode(data)
        if (!decoded.accountFlags.initialized || !decoded.accountFlags.market || !decoded.ownAddress.equals(address)) {
            throw new Error('Invalid market')
        }
        const [baseMintDecimals, quoteMintDecimals] = await Promise.all([
            getMintDecimals(connection, decoded.baseMint),
            getMintDecimals(connection, decoded.quoteMint)
        ])

        const market = new Market(decoded, baseMintDecimals, quoteMintDecimals, options, programId)
        // market._decoded = decoded
        market.baseLotSize = decoded.baseLotSize
        market.quoteLotSize = decoded.quoteLotSize
        market.baseVault = decoded.baseVault
        market.quoteVault = decoded.quoteVault
        market.requestQueue = decoded.requestQueue
        market.eventQueue = decoded.eventQueue
        market.bids = decoded.bids
        market.asks = decoded.asks
        market.quoteMint = decoded.quoteMint
        market.baseMint = decoded.baseMint
        market.vaultSignerNonce = decoded.vaultSignerNonce
        return market
    }
}

export async function getMintDecimals(connection: Connection, mint: PublicKey): Promise<number> {
    const {data} = throwIfNull(await connection.getAccountInfo(mint), 'mint not found')
    const {decimals} = SPL_MINT_LAYOUT.decode(data)
    return decimals
}

function throwIfNull<T>(value: T | null, message = 'account not found'): T {
    if (value === null) {
        throw new Error(message)
    }
    return value
}

export async function getFilteredTokenAccountsByOwner(
    connection: Connection,
    programId: PublicKey,
    mint: PublicKey
): Promise<{ context: {}; value: [] }> {
    // @ts-ignore
    const resp = await connection._rpcRequest('getTokenAccountsByOwner', [
        programId.toBase58(),
        {
            mint: mint.toBase58()
        },
        {
            encoding: 'jsonParsed'
        }
    ])
    if (resp.error) {
        throw new Error(resp.error.message)
    }
    return resp.result
}


export async function checkTxid(conn: Connection, txid: any) {
    let txidSuccessFlag = 0
    await conn.onSignature(txid, function (_signatureResult: any, _context: any) {
        if (_signatureResult.err) {
            txidSuccessFlag = -1
        } else {
            txidSuccessFlag = 1
        }
    })

    const timeAwait = new Date().getTime()
    let outOfWhile = false
    while (!outOfWhile) {
        console.log('wait txid:', txid, outOfWhile, txidSuccessFlag, (new Date().getTime() - timeAwait) / 1000)
        if (txidSuccessFlag !== 0) {
            outOfWhile = true
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (txidSuccessFlag !== 1) {
        throw new Error('Transaction failed')
    }
}

export async function createMintPair() {
    const anchor_wallet_path = __dirname + '/../test_wallets/anchor_wallet.json'
    const anchor_wallet = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(anchor_wallet_path, "utf-8")))
    );
  console.log("anchor_wallet pubkey:", anchor_wallet.publicKey.toBase58())
    const provider = anchor.AnchorProvider.env()
    const connection = provider.connection
    const wallet = provider.wallet
    const tokenA = await createMint(
        connection,
        anchor_wallet,
        anchor_wallet.publicKey,
        null,
        9
    );

    const tokenB = await createMint(
        connection,
        anchor_wallet,
        wallet.publicKey,
        null,
        9
    );
    const tokenAMintAddress = tokenA
    const tokenBMintAddress = tokenB
    const associatedTokenA = await getAssociatedTokenAddress(tokenAMintAddress, wallet.publicKey);
    const associatedTokenB = await getAssociatedTokenAddress(tokenBMintAddress, wallet.publicKey);
    const tx1 = new Transaction();
    tx1.add(
        createAssociatedTokenAccountInstruction(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, tokenAMintAddress, associatedTokenA, wallet.publicKey, wallet.publicKey),
        createAssociatedTokenAccountInstruction(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, tokenBMintAddress, associatedTokenB, wallet.publicKey, wallet.publicKey),
    );
    let txid = await provider.sendAndConfirm(tx1)

    sleep(5000)
    const tx2 = new Transaction();
    tx2.add(
        createMintToInstruction(tokenAMintAddress, associatedTokenA, wallet.publicKey, 100000000000000, [anchor_wallet]),
        createMintToInstruction(tokenBMintAddress, associatedTokenB, wallet.publicKey, 200000000000000, [anchor_wallet])
    )
    txid = await provider.sendAndConfirm(tx2)
    console.log("create tokenA: ", tokenA.toString(), " tokenB: ", tokenBMintAddress.toString(), "mint txid: ", txid)
    sleep(5000)

    return {tokenAMintAddress, tokenBMintAddress}
}


export async function createSerumMarket({
                                            connection,
                                            wallet,
                                            baseMint,
                                            quoteMint,
                                            baseLotSize,
                                            quoteLotSize,
                                            dexProgram,
                                            market
                                        }: {
    connection: Connection;
    wallet: anchor.Wallet;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    baseLotSize: number;
    quoteLotSize: number;
    dexProgram: PublicKey;
    market: Keypair;
}): Promise<SerumMarketInfo> {
    const requestQueue = new Keypair();
    const eventQueue = new Keypair();
    const bids = new Keypair();
    const asks = new Keypair();
    const baseVault = new Keypair();
    const quoteVault = new Keypair();
    const feeRateBps = 0;
    const quoteDustThreshold = new anchor.BN(10);
    const {vaultOwner, vaultNonce} = await getVaultOwnerAndNonce(market.publicKey, dexProgram);

    const tx1 = new Transaction();
    tx1.add(
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: baseVault.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(165),
            space: 165,
            programId: TokenInstructions.TOKEN_PROGRAM_ID,
        }),
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: quoteVault.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(165),
            space: 165,
            programId: TokenInstructions.TOKEN_PROGRAM_ID,
        }),
        TokenInstructions.initializeAccount({
            account: baseVault.publicKey,
            mint: baseMint,
            owner: vaultOwner,
        }),
        TokenInstructions.initializeAccount({
            account: quoteVault.publicKey,
            mint: quoteMint,
            owner: vaultOwner,
        }),
    );

    const tx2 = new Transaction();
    tx2.add(
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: market.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(
                Market.getLayout(dexProgram).span,
            ),
            space: Market.getLayout(dexProgram).span,
            programId: dexProgram,
        }),
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: requestQueue.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(5120 + 12),
            space: 5120 + 12,
            programId: dexProgram,
        }),
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: eventQueue.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(262144 + 12),
            space: 262144 + 12,
            programId: dexProgram,
        }),
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: bids.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
            space: 65536 + 12,
            programId: dexProgram,
        }),
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: asks.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
            space: 65536 + 12,
            programId: dexProgram,
        }),
        DexInstructions.initializeMarket({
            market: market.publicKey,
            requestQueue: requestQueue.publicKey,
            eventQueue: eventQueue.publicKey,
            bids: bids.publicKey,
            asks: asks.publicKey,
            baseVault: baseVault.publicKey,
            quoteVault: quoteVault.publicKey,
            baseMint,
            quoteMint,
            baseLotSize: new anchor.BN(baseLotSize),
            quoteLotSize: new anchor.BN(quoteLotSize),
            feeRateBps,
            vaultSignerNonce: vaultNonce,
            quoteDustThreshold,
            programId: dexProgram,
            authority: undefined,
        }),
    );

    const signedTransactions = await signTransactions({
        transactionsAndSigners: [
            {transaction: tx1, signers: [baseVault, quoteVault]},
            {
                transaction: tx2,
                signers: [market, requestQueue, eventQueue, bids, asks],
            },
        ],
        wallet: wallet,
        connection: connection,
    });
    for (let signedTransaction of signedTransactions) {
        await sendSignedTransaction({
            signedTransaction,
            connection: connection,
        });
    }

    return {
        market: market.publicKey,
        requestQueue: requestQueue.publicKey,
        eventQueue: eventQueue.publicKey,
        bids: bids.publicKey,
        asks: asks.publicKey,
        baseVault: baseVault.publicKey,
        quoteVault: quoteVault.publicKey,
        baseMint,
        quoteMint,
        baseLotSize: new anchor.BN(baseLotSize),
        quoteLotSize: new anchor.BN(quoteLotSize),
        feeRateBps,
        vaultOwner,
        vaultSignerNonce: vaultNonce,
        quoteDustThreshold,
        programId: dexProgram,
        // authority: undefined,
    };
}

export interface SerumMarketInfo {
    market: PublicKey;
    requestQueue: PublicKey;
    eventQueue: PublicKey;
    bids: PublicKey;
    asks: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    baseLotSize: anchor.BN;
    quoteLotSize: anchor.BN;
    feeRateBps: number;
    vaultOwner: PublicKey;
    vaultSignerNonce: anchor.BN;
    quoteDustThreshold: any;
    programId: any;
}

export async function getVaultOwnerAndNonce(marketId: PublicKey, dexProgramId: PublicKey) {
    const vaultNonce = new anchor.BN(0);
    while (true) {
        try {
            const vaultOwner = await PublicKey.createProgramAddress(
                [marketId.toBuffer(), vaultNonce.toArrayLike(Buffer, 'le', 8)],
                dexProgramId,
            );
            return {vaultOwner, vaultNonce};
        } catch (e) {
            vaultNonce.iaddn(1);
        }
    }
}

export async function signTransactions({
                                           transactionsAndSigners,
                                           wallet,
                                           connection,
                                       }: {
    transactionsAndSigners: {
        transaction: Transaction;
        signers?: Array<Keypair>;
    }[];
    wallet: anchor.Wallet;
    connection: Connection;
}) {
    const blockhash = (await connection.getRecentBlockhash('max')).blockhash;
    transactionsAndSigners.forEach(({transaction, signers = []}) => {
        transaction.recentBlockhash = blockhash;
        transaction.setSigners(
            wallet.publicKey,
            ...signers.map((s) => s.publicKey),
        );
        if (signers?.length > 0) {
            transaction.partialSign(...signers);
        }
    });
    return await wallet.signAllTransactions(
        transactionsAndSigners.map(({transaction}) => transaction),
    );
}

export async function sendSignedTransaction({
                                                signedTransaction,
                                                connection,
                                                timeout = 15000,
                                            }: {
    signedTransaction: Transaction;
    connection: Connection;
    timeout?: number;
}): Promise<string> {
    const rawTransaction = signedTransaction.serialize();
    const startTime = getUnixTs();

    const txid: TransactionSignature = await connection.sendRawTransaction(
        rawTransaction,
        {
            skipPreflight: true,
        },
    );

    console.log('Started awaiting confirmation for', txid);
    await sleep(timeout);
    console.log('Latency', txid, getUnixTs() - startTime);
    return txid;
}

export const getUnixTs = () => {
    return new Date().getTime() / 1000;
};

export async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getTokenAccountsByOwner(
    connection: Connection,
    owner: PublicKey,
  ) {
    const tokenResp = await connection.getTokenAccountsByOwner(
      owner,
      {
        programId: TOKEN_PROGRAM_ID
      },
    );
  
    const accounts: TokenAccount[] = [];
  
    for (const { pubkey, account } of tokenResp.value) {
      accounts.push({
        pubkey,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(account.data)
      });
    }
  
    return accounts;
}

export async function sendTx(connection: Connection, transaction: Transaction, signers: Array<Signer>){
    let txRetry = 0
  
    transaction.recentBlockhash = (
      await connection.getLatestBlockhash('processed')
    ).blockhash;
  
    transaction.sign(...signers);
    const rawTransaction = transaction.serialize();
  
    // console.log('packsize :', rawTransaction.length)
  
    while(++txRetry <= 3){
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        preflightCommitment: 'confirmed'
      })
  
      let url = `${txRetry}, https://solscan.io/tx/${txid}`
      if (connection.rpcEndpoint.includes('dev'))
        url += '?cluster=devnet'
      console.log(url)
  
      await new Promise(resolve => setTimeout(resolve, 1000 * 6))
      const ret = await connection.getSignatureStatus(txid, {searchTransactionHistory:true})
      try {
        //@ts-ignore
        if (ret.value && ret.value.err == null){
          console.log(txRetry,'success')
          break
        } else {
          console.log(txRetry,'failed', ret)
        }
      } catch(e){
        console.log(txRetry,'failed', ret)
      }
    }
}

export async function createAtaAndMinto(connection: Connection, baseCoin: Coin, quoteCoin: Coin, ownerKeypair :Keypair){
    const owner = ownerKeypair.publicKey;
    const transaction1 = new Transaction()
    const baseAta = await getAssociatedTokenAddress(
      baseCoin.mint,
      owner
    )
    console.log("baseAta:", baseAta.toBase58())
    transaction1.add(
      createAssociatedTokenAccountInstruction(
        owner,
        baseAta,
        owner,
        baseCoin.mint
      ),
      createMintToInstruction(
        baseCoin.mint,
        baseAta,
        owner,
        10 * 10 ** baseCoin.decimals,
        []
      )
    )
    const quoteAta = await getAssociatedTokenAddress(
      quoteCoin.mint,
      owner
    )
    console.log("quoteAta:", quoteAta.toBase58())
    transaction1.add(
      createAssociatedTokenAccountInstruction(
        owner,
        quoteAta,
        owner,
        quoteCoin.mint
      ),
      createMintToInstruction(
        quoteCoin.mint,
        quoteAta,
        owner,
        20 * 10 ** quoteCoin.decimals,
        []        
      )
    )
  
    console.log('create token accounts and request airdrop ...')
    await sendTx(connection, transaction1, [ownerKeypair] )
  
    return [baseAta, quoteAta]
}

export async function swap(connection: Connection, poolKeys: LiquidityPoolKeys, ownerKeypair: Keypair, tokenAccounts: TokenAccount[]){
    console.log('swap start')
  
    const owner = ownerKeypair.publicKey
    const poolInfo = await Liquidity.fetchInfo({connection, poolKeys})
  
    // real amount = 1000000 / 10**poolInfo.baseDecimals
    const amountIn = new TokenAmount(new Token(poolKeys.baseMint.toString(), poolInfo.baseDecimals), 0.1, false)
  
    const currencyOut = new Token(poolKeys.quoteMint.toString(), poolInfo.quoteDecimals)
  
    // 5% slippage
    const slippage = new Percent(5, 100)
  
    const {
      amountOut,
      minAmountOut,
      currentPrice,
      executionPrice,
      priceImpact,
      fee,
    } = Liquidity.computeAmountOut({ poolKeys, poolInfo, amountIn, currencyOut, slippage, })
    console.log("amountOut:", amountOut, "minAmountOut:", minAmountOut, "currentPrice:", currentPrice,
    "executionPrice:", executionPrice, "priceImpact:", priceImpact, "fee:", fee)
    
    // @ts-ignore
    // console.log(amountOut.toFixed(), minAmountOut.toFixed(), currentPrice.toFixed(), executionPrice.toFixed(), priceImpact.toFixed(), fee.toFixed())
    console.log(`swap: ${poolKeys.id.toBase58()}, amountIn: ${amountIn.toFixed()}, amountOut: ${amountOut.toFixed()}, executionPrice: ${executionPrice.toFixed()}`,)
    
    // const minAmountOut = new TokenAmount(new Token(poolKeys.quoteMint, poolInfo.quoteDecimals), 1000000)
  
    const {transaction, signers} = await Liquidity.makeSwapTransaction({
        connection,
        poolKeys,
        userKeys: {
            tokenAccounts,
            owner,
        },
        amountIn,
        amountOut: minAmountOut,
        fixedSide: "in"
    })
  
    await sendTx(connection, transaction, [ownerKeypair, ...signers ])
    console.log('swap end')
}

export async function getLiquidityInfo(connection: Connection, poolId:PublicKey, dexProgramId:PublicKey){
    const info = await connection.getAccountInfo(poolId);
    if (info === null) return null
    const state = LIQUIDITY_STATE_LAYOUT_V4.decode(info.data);
  
    const baseTokenAmount = await connection.getTokenAccountBalance(state.baseVault);
    const quoteTokenAmount = await connection.getTokenAccountBalance(state.quoteVault);
    const openOrders = await OpenOrders.load(connection, state.openOrders, dexProgramId);
  
    const baseDecimal = 10 ** state.baseDecimal.toNumber()
    const quoteDecimal = 10 ** state.quoteDecimal.toNumber()
  
    const openOrdersTotalBase = openOrders.baseTokenTotal.toNumber() / baseDecimal
    const openOrdersTotalQuote = openOrders.quoteTokenTotal.toNumber() / quoteDecimal
    
    const basePnl = state.baseNeedTakePnl.toNumber() / baseDecimal
    const quotePnl = state.quoteNeedTakePnl.toNumber() / quoteDecimal 
  
    // @ts-ignore
    const base = baseTokenAmount.value?.uiAmount + openOrdersTotalBase - basePnl
  
    // @ts-ignore
    const quote =  quoteTokenAmount.value?.uiAmount + openOrdersTotalQuote - quotePnl
  
    const lpSupply =  parseFloat(state.lpReserve.toString())
    const priceInQuote = quote / base 
  
    return {
      base,
      quote,
      lpSupply,
      baseVaultKey: state.baseVault,
      quoteVaultKey: state.quoteVault,
      baseVaultBalance: baseTokenAmount.value.uiAmount,
      quoteVaultBalance: quoteTokenAmount.value.uiAmount,
      openOrdersKey: state.openOrders,
      openOrdersTotalBase,
      openOrdersTotalQuote,
      basePnl,
      quotePnl,
      priceInQuote
    }
}

export async function fetchPoolKeys(
    connection: Connection,
    poolId: PublicKey,
    version : number = 4
  ) {
  
    // const version = 4
    const serumVersion = 3
    const marketVersion = 3
  
    const programId = LIQUIDITY_PROGRAM_ID_V4
    const serumProgramId = SERUM_PROGRAM_ID_V3
  
    const account = await connection.getAccountInfo(poolId)
    const { state: LiquidityStateLayout }  = Liquidity.getLayouts(version)
  
    //@ts-ignore
    const fields = LiquidityStateLayout.decode(account.data);
    const { status, baseMint, quoteMint, lpMint, openOrders, targetOrders, baseVault, quoteVault, marketId } = fields;
  
    let withdrawQueue: PublicKey
    let lpVault : PublicKey
  
    if (Liquidity.isV4(fields)) {
      withdrawQueue = fields.withdrawQueue;
      lpVault = fields.lpVault;
    } else {
      withdrawQueue = PublicKey.default;
      lpVault = PublicKey.default;
    }
    
    // uninitialized
    // if (status.isZero()) {
    //   return ;
    // }
  
    const associatedPoolKeys = await getAssociatedPoolKeys({
      programId,
      serumProgramId,
      marketId,
      baseMint,
      quoteMint,
    });
  
    const poolKeys = {
      id: poolId,
      baseMint,
      quoteMint,
      lpMint,
      baseDecimals: 9,  // added
      quoteDecimals: 9, // added 
      lpDecimals: 9,    // added
      version,
      programId,
  
      authority: associatedPoolKeys.authority,
      openOrders,
      targetOrders,
      baseVault,
      quoteVault,
      withdrawQueue,
      lpVault,
      marketVersion: serumVersion,
      marketProgramId: serumProgramId,
      marketId,
      marketAuthority: associatedPoolKeys.marketAuthority,
    };
  
    const marketInfo = await connection.getAccountInfo(marketId);
    const { state: MARKET_STATE_LAYOUT } = raydiumSerum.getLayouts(marketVersion);
    //@ts-ignore
    const market = MARKET_STATE_LAYOUT.decode(marketInfo.data);
  
    const {
      baseVault: marketBaseVault,
      quoteVault: marketQuoteVault,
      bids: marketBids,
      asks: marketAsks,
      eventQueue: marketEventQueue,
    } = market;
  
    // const poolKeys: LiquidityPoolKeys;
    return {
      ...poolKeys,
      ...{
        marketBaseVault,
        marketQuoteVault,
        marketBids,
        marketAsks,
        marketEventQueue,
      },
    };
}