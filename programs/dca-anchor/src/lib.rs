use anchor_lang::prelude::*;
use anchor_spl::{token::{SyncNative, sync_native, Token, TokenAccount, Transfer as Token_Transfer, transfer as token_transfer}, associated_token::AssociatedToken};
use anchor_lang::system_program::{Transfer as Sol_Transfer, transfer as sol_transfer};
use raydium_contract_instructions::amm_instruction;
// use instructions::*;

// pub mod instructions;

declare_id!("FdHNRbJV4TypBrgjHhsB7EuUFScQ2SQnyTh8w3FQbMcg");

#[program]
pub mod dca_anchor {
    use super::*;

    // Function to transfer token into vault_token_ata
    pub fn deposit_token(ctx: Context<DepositToken>, amount: u64) -> Result<()> {
        let dca_info = &mut ctx.accounts.dca_account;
        dca_info.total_amount = amount;
        dca_info.sender_account = ctx.accounts.sender_account.key();
        dca_info.mint_address = ctx.accounts.token_mint.key();
        dca_info.flag = 2;
        dca_info.state = false;

        msg!("Make the token transfer");
        let cpi_ctx_program = ctx.accounts.token_program.to_account_info();
        let transfer_struct = Token_Transfer{
            from: ctx.accounts.sender_ata.to_account_info(),
            to: ctx.accounts.vault_token_ata.to_account_info(),
            authority: ctx.accounts.sender_account.to_account_info()
        };
        let cpi_ctx = CpiContext::new(cpi_ctx_program, transfer_struct);
        token_transfer(cpi_ctx, amount)?;
        Ok(())
    }

    // Function to transfer sol into vault_wrap_ata
    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        let dca_info = &mut ctx.accounts.dca_account;
        dca_info.total_amount = amount;
        dca_info.sender_account = ctx.accounts.sender_account.key();
        dca_info.mint_address = ctx.accounts.token_mint.key();
        dca_info.flag = 1;
        dca_info.state = false;

        msg!("Make the wrapped Sol token transfer");
        let cpi_ctx_token_program = ctx.accounts.token_program.to_account_info();
        // let transfer_struct = Token_Transfer{
        //     from: ctx.accounts.sender_ata.to_account_info(),
        //     to: ctx.accounts.vault_token_ata.to_account_info(),
        //     authority: ctx.accounts.sender_account.to_account_info()
        // };
        // let cpi_ctx = CpiContext::new(cpi_ctx_program, transfer_struct);
        // token_transfer(cpi_ctx, amount)?;

        let cpi_ctx_program = ctx.accounts.system_program.to_account_info();
        let transfer_struct = Sol_Transfer{
            from: ctx.accounts.sender_account.to_account_info(),
            to: ctx.accounts.vault_wrap_ata.to_account_info()
        };
        let cpi_ctx = CpiContext::new(cpi_ctx_program, transfer_struct);
        sol_transfer(cpi_ctx, amount)?;

        let sync_native_struct = SyncNative{
            account: ctx.accounts.vault_wrap_ata.to_account_info()
        };
        let cpi_ctx_native = CpiContext::new(cpi_ctx_token_program, sync_native_struct);
        // sync_native(&ctx.accounts.token_program.key(), &ctx.accounts.vault_wrap_ata.key())?;
        sync_native(cpi_ctx_native)?;
        Ok(())
    }

    // Function to initialize the dca account for the swapping process
    pub fn initialize_dca(ctx: Context<InitializeDca>, start_time: u64, dca_amount: u64, dca_time: u64) -> Result<()> {
        let dca_info = &mut ctx.accounts.dca_account;
        dca_info.start_time = start_time;
        dca_info.dca_amount = dca_amount;
        dca_info.dca_time = dca_time;
        dca_info.state = true;
        Ok(())
    }

    // Function to swap token from sol (WrappedSol -> USDC)
    // pub fn swap_from_sol(ctx: Context<ProxySwapBaseIn>, amount_in: u64, minimum_amount_out: u64) -> Result<()> {
    //     msg!("Swap WrappedSol -> USDC");
    //     // let dca_info = &mut ctx.accounts.dca_account;
    //     // dca_info.start_time = dca_info.dca_time;
        
    //     // let amount_in = ctx.accounts.dca_account.dca_amount;
    //     // let cpi_program = ctx.accounts.our_program_id.to_account_info();
    //     instructions::swap_base_in(ctx, amount_in, minimum_amount_out)?;
    //     msg!("Successfully Swapped");
    //     Ok(())
    // }

    // Function to swap token from sol (WrappedSol -> USDC)
    pub fn swap_from_sol(
        ctx: Context<SwapBaseIn>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        let ix = amm_instruction::swap_base_in(
            &ctx.program_id.key(),
            ctx.accounts.amm.key,
            ctx.accounts.amm_authority.key,
            ctx.accounts.amm_open_orders.key,
            ctx.accounts.amm_target_orders.key,
            ctx.accounts.pool_coin_token_account.key,
            ctx.accounts.pool_pc_token_account.key,
            ctx.accounts.serum_program.key,
            ctx.accounts.serum_market.key,
            ctx.accounts.serum_bids.key,
            ctx.accounts.serum_asks.key,
            ctx.accounts.serum_event_queue.key,
            ctx.accounts.serum_coin_vault_account.key,
            ctx.accounts.serum_pc_vault_account.key,
            ctx.accounts.serum_vault_signer.key,
            ctx.accounts.user_source_token_account.key,
            ctx.accounts.user_destination_token_account.key,
            ctx.accounts.user_source_owner.key,
            amount_in,
            minimum_amount_out,
        )?;

        let (_vault_address,bump_seed)=Pubkey::find_program_address(
            &[
                &ctx.accounts.sender_account.key.to_bytes(),
                &ctx.accounts.dca_account.key().to_bytes()
            ],
            ctx.program_id,
        );
        let vault_signer_seeds: &[&[&[_]]] = &[&[
            &ctx.accounts.sender_account.key.to_bytes(),
            &ctx.accounts.dca_account.key().to_bytes(),
            &[bump_seed],
        ]];

        solana_program::program::invoke_signed(
            &ix,
            &ToAccountInfos::to_account_infos(ctx.accounts),
            &vault_signer_seeds,
        )?;
        Ok(())
    }

}

#[derive(Accounts)]
pub struct DepositToken<'info> {
    #[account(mut)]
    pub sender_account: Signer<'info>,
    #[account(init_if_needed, payer = sender_account, space = 8 + 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 8)]
    pub dca_account: Account<'info, DcaData>,
    /// CHECK:
    #[account(init_if_needed, payer = sender_account, space = 0, seeds = [sender_account.key().as_ref(), dca_account.key().as_ref()], bump)]
    pub vault: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK:
    #[account(mut)]
    pub token_mint: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub token_mint_wrap: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    #[account(mut)]
    pub sender_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_wrap_ata: Account<'info, TokenAccount>,
    pub associated_token_program: Program<'info, AssociatedToken>
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(init_if_needed, payer = sender_account, space = 8 + 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 8)]
    pub dca_account: Account<'info, DcaData>,
    #[account(mut)]
    pub sender_account: Signer<'info>,
    /// CHECK:
    #[account(init_if_needed, payer = sender_account, space = 0, seeds = [sender_account.key().as_ref(), dca_account.key().as_ref()], bump)]
    pub vault: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK:
    #[account(mut)]
    pub token_mint: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub token_mint_wrap: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    #[account(mut)]
    pub sender_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_wrap_ata: Account<'info, TokenAccount>,
    pub associated_token_program: Program<'info, AssociatedToken>
}

#[derive(Accounts)]
pub struct InitializeDca<'info> {
    #[account(mut)]
    pub dca_account: Account<'info, DcaData>
}

// #[derive(Accounts)]
// pub struct SwapFromSol<'info> {
//     // CHECK:
//     // #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
//     // #[account(mut)]
//     // pub our_program_id: AccountInfo<'info>,

//     /// CHECK: Safe
//     pub our_program_id: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub amm_id: AccountInfo<'info>,
//     /// CHECK: Safe
//     pub amm_authority: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub amm_open_orders: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub amm_target_orders: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub pool_coin_token_account: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub pool_pc_token_account: AccountInfo<'info>,
//     /// CHECK: Safe
//     pub serum_program_id: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub serum_market: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub serum_bids: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub serum_asks: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub serum_event_queue: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub serum_coin_vault_account: AccountInfo<'info>,
//     /// CHECK: Safe
//     #[account(mut)]
//     pub serum_pc_vault_account: AccountInfo<'info>,
//     /// CHECK: Safe
//     pub serum_vault_signer: AccountInfo<'info>,
//     /// CHECK:
//     #[account(mut, seeds = [sender_account.key().as_ref(), dca_account.key().as_ref()], bump)]
//     pub vault: AccountInfo<'info>,
//     #[account(mut)]
//     pub vault_wrap_ata: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub vault_token_ata: Account<'info, TokenAccount>, // This is the user destination token account
//     /// CHECK:
//     #[account(mut)]
//     pub token_mint: AccountInfo<'info>,
//     /// CHECK:
//     #[account(mut)]
//     pub sender_account: AccountInfo<'info>,
//     #[account(mut)]
//     pub dca_account: Account<'info, DcaData>,
//     /// CHECK:
//     #[account(mut)]
//     pub token_mint_wrap: AccountInfo<'info>,
//     pub token_program: Program<'info, Token>
// }


/// Accounts for an `swap_base_in` instruction.
#[derive(Accounts)]
pub struct SwapBaseIn<'info> {
    /// CHECK: Safe. amm Account
    #[account(mut)]
    pub amm: AccountInfo<'info>,
    /// CHECK: Safe. Amm authority Account
    pub amm_authority: AccountInfo<'info>,
    /// CHECK: Safe. amm open_orders Account
    #[account(mut)]
    pub amm_open_orders: AccountInfo<'info>,
    /// CHECK: Safe. amm target_orders Account
    #[account(mut)]
    pub amm_target_orders: AccountInfo<'info>,
    /// CHECK: Safe. pool_token_coin Amm Account to swap FROM or To,
    #[account(mut)]
    pub pool_coin_token_account: AccountInfo<'info>,
    /// CHECK: Safe. pool_token_pc Amm Account to swap FROM or To,
    #[account(mut)]
    pub pool_pc_token_account: AccountInfo<'info>,
    /// CHECK: Safe. serum dex program id
    pub serum_program: AccountInfo<'info>,
    /// CHECK: Safe. serum market Account. serum_dex program is the owner.
    #[account(mut)]
    pub serum_market: AccountInfo<'info>,
    /// CHECK: Safe. bids Account
    #[account(mut)]
    pub serum_bids: AccountInfo<'info>,
    /// CHECK: Safe. asks Account
    #[account(mut)]
    pub serum_asks: AccountInfo<'info>,
    /// CHECK: Safe. event_q Account
    #[account(mut)]
    pub serum_event_queue: AccountInfo<'info>,
    /// CHECK: Safe. coin_vault Account
    #[account(mut)]
    pub serum_coin_vault_account: AccountInfo<'info>,
    /// CHECK: Safe. pc_vault Account
    #[account(mut)]
    pub serum_pc_vault_account: AccountInfo<'info>,
    /// CHECK: Safe. vault_signer Account
    #[account(mut)]
    pub serum_vault_signer: AccountInfo<'info>,
    /// CHECK: Safe. user source token Account. user Account to swap from.
    #[account(mut)]
    pub user_source_token_account: AccountInfo<'info>,
    /// CHECK: Safe. user destination token Account. user Account to swap to.
    #[account(mut)]
    pub user_destination_token_account: AccountInfo<'info>,
    /// CHECK: Safe. user owner Account
    // #[account(signer)]
    #[account(mut, seeds = [sender_account.key().as_ref(), dca_account.key().as_ref()], bump)]
    pub user_source_owner: AccountInfo<'info>,
    /// CHECK: Safe. The spl token program
    #[account(address = spl_token::ID)]
    pub spl_token_program: AccountInfo<'info>,

    #[account(init_if_needed, payer = sender_account, space = 8 + 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 8)]
    pub dca_account: Account<'info, DcaData>,
    #[account(mut)]
    pub sender_account: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct DcaData{
    total_amount: u64,
    sender_account: Pubkey,
    mint_address: Pubkey,
    start_time: u64,
    dca_amount: u64,
    dca_time: u64,
    flag: u8,    // This flag is used for swapping: 1 for sol to mint, 2 for mint to sol
    state: bool,
    minimum_amount_out: u64
}
