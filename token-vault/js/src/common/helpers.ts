import { bignum } from '@metaplex-foundation/beet';
import {
  AccountLayout as TokenAccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { InstructionsWithAccounts } from '../types';
import { VAULT_PREFIX, VAULT_PROGRAM_ID } from './consts';

// -----------------
// Helpers from common/src/actions/action.ts adapted to return instructions + signers instead of mutating
// and metaplex/js/packages/cli/src/helpers/accounts.ts
// -----------------

// -----------------
// Transfers
// -----------------
export function approveTokenTransfer({
  sourceAccount,
  owner,
  amount,
}: {
  sourceAccount: PublicKey;
  owner: PublicKey;
  amount: bignum;
}): [TransactionInstruction, Keypair] {
  const transferAuthority = Keypair.generate();
  const createApproveIx = Token.createApproveInstruction(
    TOKEN_PROGRAM_ID,
    sourceAccount,
    transferAuthority.publicKey,
    owner,
    [],
    amount,
  );

  return [createApproveIx, transferAuthority];
}

// -----------------
// Associated Token Account
// -----------------

// See: https://spl.solana.com/associated-token-account
export async function createAssociatedTokenAccount({
  tokenMint,
  tokenOwner,
  payer,
}: {
  tokenMint: PublicKey;
  tokenOwner: PublicKey;
  payer: PublicKey;
}): Promise<[TransactionInstruction, PublicKey]> {
  const associatedTokenAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    tokenMint,
    tokenOwner,
  );
  const createATAInstruction = Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    tokenMint,
    associatedTokenAccount,
    tokenOwner,
    payer,
  );

  return [createATAInstruction, associatedTokenAccount];
}

// -----------------
// Init Mint Account
// -----------------
export function createMint(
  payer: PublicKey,
  mintRentExempt: number,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey,
): InstructionsWithAccounts<{ mintAccountPair: Keypair; mintAccount: PublicKey }> {
  const [createMintIx, mintAccountPair, mintAccount] = createUninitializedMint(
    payer,
    mintRentExempt,
  );

  const initMintIx = Token.createInitMintInstruction(
    TOKEN_PROGRAM_ID,
    mintAccount,
    decimals,
    mintAuthority,
    freezeAuthority,
  );

  return [[createMintIx, initMintIx], [mintAccountPair], { mintAccountPair, mintAccount }];
}

export function getMintRentExempt(connection: Connection) {
  return connection.getMinimumBalanceForRentExemption(MintLayout.span);
}

export function createUninitializedMint(
  payer: PublicKey,
  amount: number,
): [TransactionInstruction, Keypair, PublicKey] {
  const mintAccount = Keypair.generate();
  const instruction = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: mintAccount.publicKey,
    lamports: amount,
    space: MintLayout.span,
    programId: TOKEN_PROGRAM_ID,
  });

  return [instruction, mintAccount, mintAccount.publicKey];
}

// -----------------
// Init Token Account
// -----------------
export function mintTokens(
  mint: PublicKey,
  tokenAccount: PublicKey,
  mintAuthority: PublicKey,
  amount: bignum,
): TransactionInstruction {
  return Token.createMintToInstruction(
    TOKEN_PROGRAM_ID,
    mint,
    tokenAccount,
    mintAuthority,
    [],
    amount,
  );
}

export function getTokenRentExempt(connection: Connection) {
  return connection.getMinimumBalanceForRentExemption(TokenAccountLayout.span);
}

export function createTokenAccount(
  payer: PublicKey,
  accountRentExempt: number,
  mint: PublicKey,
  owner: PublicKey,
): InstructionsWithAccounts<{ tokenAccountPair: Keypair; tokenAccount: PublicKey }> {
  const [createAccountIx, signer, { tokenAccountPair, tokenAccount }] =
    createUninitializedTokenAccount(payer, accountRentExempt);
  const initAccountIx = Token.createInitAccountInstruction(
    TOKEN_PROGRAM_ID,
    mint,
    tokenAccount,
    owner,
  );

  return [[createAccountIx, initAccountIx], [signer], { tokenAccountPair, tokenAccount }];
}

export function createUninitializedTokenAccount(
  payer: PublicKey,
  amount: number,
): [TransactionInstruction, Signer, { tokenAccountPair: Keypair; tokenAccount: PublicKey }] {
  const tokenAccountPair = Keypair.generate();
  const instruction = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: tokenAccountPair.publicKey,
    lamports: amount,
    space: TokenAccountLayout.span,
    programId: TOKEN_PROGRAM_ID,
  });

  return [
    instruction,
    tokenAccountPair,
    { tokenAccountPair, tokenAccount: tokenAccountPair.publicKey },
  ];
}

// -----------------
// PDA / Vault
// -----------------
export async function createVaultOwnedTokenAccount(
  connection: Connection,
  payer: PublicKey,
  vault: PublicKey,
  tokenMint: PublicKey,
): Promise<InstructionsWithAccounts<{ tokenAccount: PublicKey }>> {
  const vaultPDA = await pdaForVault(vault);
  const tokenAccountRentExempt = await connection.getMinimumBalanceForRentExemption(
    TokenAccountLayout.span,
  );
  const [instructions, signers, { tokenAccount }] = createTokenAccount(
    payer,
    tokenAccountRentExempt,
    tokenMint, // mint
    vaultPDA, // owner
  );
  return [instructions, signers, { tokenAccount }];
}

/**
 * Used to derive Vault PDA for a particular vault account.
 * Used for `fractionMintAuthority`.
 */
export async function pdaForVault(vault: PublicKey) {
  const [vaultPDA] = await PublicKey.findProgramAddress(
    [Buffer.from(VAULT_PREFIX), VAULT_PROGRAM_ID.toBuffer(), vault.toBuffer()],
    VAULT_PROGRAM_ID,
  );
  return vaultPDA;
}
