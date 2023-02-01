import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "bn.js";
import { DcaAnchor } from "../target/types/dca_anchor";
import { readFileSync } from "fs";

describe("dca-anchor", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  const wallet = provider.wallet;
  anchor.setProvider(provider);
  const program = anchor.workspace.DcaAnchor as Program<DcaAnchor>;

  const test_wallet_path = __dirname + '/../test_wallets/VLTQv5rvWFmT9Rt5BenjSM9L9ttEZeVXrP4fna7Pxs1.json'
  const wallet_1_path = __dirname + '/../test_wallets/wallet_1.json'
  const dca_account = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(test_wallet_path, "utf-8")))
    );
  console.log("dca_account pubkey:", dca_account.publicKey.toBase58())
  const wallet_1 = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(readFileSync(wallet_1_path, "utf-8")))
    );
  console.log("wallet_1 pubkey:", wallet_1.publicKey.toBase58())

  // let dca_account = Keypair.generate();
  // let dca_account = new PublicKey("8cBeHtYPeEN2pUqRL6a76qScyU6ah6cJdVWjvEhLQ9in");
  // console.log("dca_account pubkey:", dca_account.publicKey.toBase58())
  let mintAddress = new PublicKey("2tWC4JAdL4AxEFJySziYJfsAnW2MHKRo98vbAPiRDSk8")  // USD Coin(Saber Devnet)
  let solWrapmint = new PublicKey("So11111111111111111111111111111111111111112")

  it("Is initialized!", async () => {
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
    const tx = await program.methods.depositSol(
      new BN(1 * LAMPORTS_PER_SOL)
    ).accounts({
      dcaAccount: dca_account.publicKey,
      senderAccount: wallet_1.publicKey,
      vault: vault_acc,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenMint: mintAddress,
      tokenMintWrap: solWrapmint,
      systemProgram: SystemProgram.programId,
      senderAta: sender_ata,
      vaultTokenAta: vault_ata,
      vaultWrapAta: vault_wrap_ata,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([dca_account, wallet_1])
    .rpc();
    console.log("Your transaction signature", tx);
  });
});
