import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import {
  Liquidity,
  findProgramAddress,
  Market,
  LiquidityAssociatedPoolKeys,
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityStateLayout,
  GetMultipleAccountsInfoConfig,
  getMultipleAccountsInfo,
} from "@raydium-io/raydium-sdk";
import { Buffer } from "buffer";

const LIQUIDITY_PROGRAM_ID_V4 = new PublicKey("9rpQHSyFVM1dkkHFQ2TtTzPEW7DVmEyPmN8wVniqJtuC");
const SERUM_PROGRAM_ID_V3 = new PublicKey("DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY");

async function getAssociatedId({
  programId,
  marketId,
}: {
  programId: PublicKey;
  marketId: PublicKey;
}) {
  const { publicKey } = await findProgramAddress(
    [
      programId.toBuffer(),
      marketId.toBuffer(),
      Buffer.from("amm_associated_seed", "utf-8"),
    ],
    programId
  );
  return publicKey;
}

async function getAssociatedAuthority({ programId }: { programId: PublicKey }) {
  return findProgramAddress(
    // new Uint8Array(Buffer.from('amm authority'.replace('\u00A0', ' '), 'utf-8'))
    [
      Buffer.from([
        97, 109, 109, 32, 97, 117, 116, 104, 111, 114, 105, 116, 121,
      ]),
    ],
    programId
  );
}

async function getAssociatedLpMint({
  programId,
  marketId,
}: {
  programId: PublicKey;
  marketId: PublicKey;
}) {
  const { publicKey } = await findProgramAddress(
    [
      programId.toBuffer(),
      marketId.toBuffer(),
      Buffer.from("lp_mint_associated_seed", "utf-8"),
    ],
    programId
  );
  return publicKey;
}

async function getAssociatedBaseVault({
  programId,
  marketId,
}: {
  programId: PublicKey;
  marketId: PublicKey;
}) {
  const { publicKey } = await findProgramAddress(
    [
      programId.toBuffer(),
      marketId.toBuffer(),
      Buffer.from("coin_vault_associated_seed", "utf-8"),
    ],
    programId
  );
  return publicKey;
}

async function getAssociatedQuoteVault({
  programId,
  marketId,
}: {
  programId: PublicKey;
  marketId: PublicKey;
}) {
  const { publicKey } = await findProgramAddress(
    [
      programId.toBuffer(),
      marketId.toBuffer(),
      Buffer.from("pc_vault_associated_seed", "utf-8"),
    ],
    programId
  );
  return publicKey;
}

async function getAssociatedLpVault({
  programId,
  marketId,
}: {
  programId: PublicKey;
  marketId: PublicKey;
}) {
  const { publicKey } = await findProgramAddress(
    [
      programId.toBuffer(),
      marketId.toBuffer(),
      Buffer.from("temp_lp_token_associated_seed", "utf-8"),
    ],
    programId
  );
  return publicKey;
}

async function getAssociatedTargetOrders({
  programId,
  marketId,
}: {
  programId: PublicKey;
  marketId: PublicKey;
}) {
  const { publicKey } = await findProgramAddress(
    [
      programId.toBuffer(),
      marketId.toBuffer(),
      Buffer.from("target_associated_seed", "utf-8"),
    ],
    programId
  );
  return publicKey;
}

async function getAssociatedWithdrawQueue({
  programId,
  marketId,
}: {
  programId: PublicKey;
  marketId: PublicKey;
}) {
  const { publicKey } = await findProgramAddress(
    [
      programId.toBuffer(),
      marketId.toBuffer(),
      Buffer.from("withdraw_associated_seed", "utf-8"),
    ],
    programId
  );
  return publicKey;
}

async function getAssociatedOpenOrders({
  programId,
  marketId,
}: {
  programId: PublicKey;
  marketId: PublicKey;
}) {
  const { publicKey } = await findProgramAddress(
    [
      programId.toBuffer(),
      marketId.toBuffer(),
      Buffer.from("open_order_associated_seed", "utf-8"),
    ],
    programId
  );
  return publicKey;
}

async function getAssociatedPoolKeys({
  version,
  marketId,
  baseMint,
  quoteMint,
}: {
  version: number;
  marketId: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
}): Promise<any> {
  const programId = LIQUIDITY_PROGRAM_ID_V4;

  const id = await getAssociatedId({ programId, marketId });
  const lpMint = await getAssociatedLpMint({ programId, marketId });
  const { publicKey: authority, nonce } = await getAssociatedAuthority({
    programId,
  });
  const baseVault = await getAssociatedBaseVault({ programId, marketId });
  const quoteVault = await getAssociatedQuoteVault({ programId, marketId });
  const lpVault = await getAssociatedLpVault({ programId, marketId });
  const openOrders = await getAssociatedOpenOrders({ programId, marketId });
  const targetOrders = await getAssociatedTargetOrders({ programId, marketId });
  const withdrawQueue = await getAssociatedWithdrawQueue({
    programId,
    marketId,
  });

  const serumVersion = 3;
  const serumProgramId = SERUM_PROGRAM_ID_V3;
  const { publicKey: marketAuthority } = await Market.getAssociatedAuthority({
    programId: serumProgramId,
    marketId,
  });

  return {
    // base
    id,
    baseMint,
    quoteMint,
    lpMint,
    // version
    version,
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
    marketVersion: serumVersion,
    marketProgramId: serumProgramId,
    // market keys
    marketId,
    marketAuthority,
  };
}

export async function findPoolIdByBaseAndQuoteMintDevnet(
  connection: Connection,
  base: string,
  quote: string
): Promise<string> {
  try {
    const poolKeysList = await fetchAllPoolKeys(connection);
    const keys = poolKeysList.find(
      (el: any) =>
        el.baseMint == base &&
        el.quoteMint == quote &&
        // el.marketId == "9zb9brZMMAgqCRYrzBFCc34TLRg7dMAHRXBgEZgbQq1X"
        el.marketId == "3tsrPhKrWHWMB8RiPaqNxJ8GnBhZnDqL4wcu5EAMFeBe"
        // el.marketId == "6geKNrhvPKV8fAaPaNqfGskgyH5h7LxxSm4oANXAcGma"
    );
    // console.log("market id", keys.marketId.toString());
    if (!keys)
      throw new Error("No liquidity pool found for given base and quote mint.");
    return keys.id.toString();
  } catch (err) {
    throw err;
  }
}

export async function fetchAllPoolKeys(
  connection: Connection,
  config?: GetMultipleAccountsInfoConfig
) {
  // supported versions
  const supported = [
    {
      version: 4,
      programId: LIQUIDITY_PROGRAM_ID_V4,
      serumVersion: 3,
      serumProgramId: SERUM_PROGRAM_ID_V3,
      stateLayout: LIQUIDITY_STATE_LAYOUT_V4,
    },
  ];
  let poolsAccountInfo: {
    pubkey: PublicKey;
    account: AccountInfo<Buffer>;

    version: number;
    programId: PublicKey;
    serumVersion: number;
    serumProgramId: PublicKey;
    stateLayout: LiquidityStateLayout;
  }[][] = [];
  try {
    poolsAccountInfo = await Promise.all(
      supported.map(
        ({ programId, version, serumVersion, serumProgramId, stateLayout }) =>
          connection
            .getProgramAccounts(programId, {
              filters: [{ dataSize: stateLayout.span }],
            })
            .then((accounts) => {
              return accounts.map((info) => {
                return {
                  ...info,
                  ...{
                    version,
                    programId,
                    serumVersion,
                    serumProgramId,
                    stateLayout,
                  },
                };
              });
            })
      )
    );
  } catch (error) {}
  const flatPoolsAccountInfo = poolsAccountInfo.flat();
  // temp pool keys without market keys
  const tempPoolsKeys = [];

  for (const {
    pubkey,
    account: accountInfo,
    version,
    programId,
    serumVersion,
    serumProgramId,
    stateLayout: LIQUIDITY_STATE_LAYOUT,
  } of flatPoolsAccountInfo) {
    const { data } = accountInfo;

    const fields = LIQUIDITY_STATE_LAYOUT.decode(data);
    const {
      status,
      nonce,
      baseMint,
      quoteMint,
      lpMint,
      openOrders,
      targetOrders,
      baseVault,
      quoteVault,
      marketId,
    } = fields;

    let withdrawQueue, lpVault;
    if (Liquidity.isV4(fields)) {
      withdrawQueue = fields.withdrawQueue;
      lpVault = fields.lpVault;
    } else {
      withdrawQueue = PublicKey.default;
      lpVault = PublicKey.default;
    }
    // uninitialized
    if (status.isZero()) {
      continue;
    }

    const associatedPoolKeys = await getAssociatedPoolKeys({
      version,
      baseMint,
      quoteMint,
      marketId,
    });
    // double check keys with on-chain data
    // logger.assert(Number(nonce) === associatedPoolKeys.nonce, "invalid nonce");
    tempPoolsKeys.push({
      id: pubkey,
      baseMint,
      quoteMint,
      lpMint,
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
    });
  }
  // fetch market keys
  let marketsInfo: (AccountInfo<Buffer> | null)[] = [];
  try {
    marketsInfo = await getMultipleAccountsInfo(
      connection,
      tempPoolsKeys.map(({ marketId }) => marketId),
      config
    );
  } catch (error) {}
  const poolsKeys = [];

  for (const index in marketsInfo) {
    const poolKeys = tempPoolsKeys[index];
    const marketInfo = marketsInfo[index];

    const { id, marketVersion } = poolKeys;

    // @ts-ignore
    const { data } = marketInfo;
    const { state: MARKET_STATE_LAYOUT } = Market.getLayouts(marketVersion);

    const {
      baseVault: marketBaseVault,
      quoteVault: marketQuoteVault,
      bids: marketBids,
      asks: marketAsks,
      eventQueue: marketEventQueue,
    } = MARKET_STATE_LAYOUT.decode(data);

    poolsKeys.push({
      ...poolKeys,
      ...{
        marketBaseVault,
        marketQuoteVault,
        marketBids,
        marketAsks,
        marketEventQueue,
      },
    });
  }

  return poolsKeys;
}

export async function fetchPoolKeys(
  connection: Connection,
  poolId: PublicKey,
  version = 4
) {
  // const version = 4
  const serumVersion = 3;
  const marketVersion = 3;

  const programId = LIQUIDITY_PROGRAM_ID_V4;
  const serumProgramId = SERUM_PROGRAM_ID_V3;

  const account = await connection.getAccountInfo(poolId);
  const { state: LiquidityStateLayout } = Liquidity.getLayouts(version);

  //@ts-ignore
  const fields = LiquidityStateLayout.decode(Uint8Array.from(account.data));
  const {
    status,
    baseMint,
    quoteMint,
    lpMint,
    openOrders,
    targetOrders,
    baseVault,
    quoteVault,
    marketId,
  } = fields;

  let withdrawQueue;
  let lpVault;

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
    version,
    baseMint,
    quoteMint,
    marketId,
  });

  const poolKeys = {
    id: poolId,
    baseMint,
    quoteMint,
    lpMint,
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
  const { state: MARKET_STATE_LAYOUT } = Market.getLayouts(marketVersion);
  //@ts-ignore
  const market = MARKET_STATE_LAYOUT.decode(Uint8Array.from(marketInfo.data));
  console.log("market", market);
  console.log("baseDepositsTotal", market.baseDepositsTotal.toString());
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