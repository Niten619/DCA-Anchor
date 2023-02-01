use anchor_lang::prelude::*;
use anchor_spl::{token::{SyncNative, sync_native, Token, TokenAccount, Transfer as Token_Transfer, transfer as token_transfer}, associated_token::AssociatedToken};
use anchor_lang::system_program::{Transfer as Sol_Transfer, transfer as sol_transfer};

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
