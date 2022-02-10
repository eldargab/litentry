import { EventHandlerContext } from '@subsquid/substrate-processor';
import {
  SubstrateAccount,
  SubstrateBalance,
  SubstrateNetwork,
  SubstrateTransfer,
} from '../model';
import { encodeAddress, getRegistry } from '../utils/registry';
import { BalancesTransferEvent as KhalaBalancesTransferEvent } from '../types/khala/events';
import { BalancesTransferEvent as PolkadotBalancesTransferEvent } from '../types/polkadot/events';
import { BalancesTransferEvent as KusamaBalancesTransferEvent } from '../types/kusama/events';
import { getOrCreate, getOrCreateAccount } from '../utils/store';
import getAccountHex from '../utils/getAccountHex';

interface TransferEvent {
  from: Uint8Array;
  to: Uint8Array;
  amount: bigint;
}

function getTransferEvent(
  ctx: EventHandlerContext,
  network: SubstrateNetwork
): TransferEvent {
  switch (network) {
    case SubstrateNetwork.phala: {
      const event = new KhalaBalancesTransferEvent(ctx);

      if (event.isV1) {
        const [from, to, amount] = event.asV1;
        return { from, to, amount };
      } else if (event.isV1090) {
        return event.asV1090;
      } else {
        return event.asLatest;
      }
    }

    case SubstrateNetwork.polkadot: {
      const event = new PolkadotBalancesTransferEvent(ctx);

      if (event.isV0) {
        const [from, to, amount] = event.asV0;
        return { from, to, amount };
      } else if (event.isV9140) {
        return event.asV9140;
      } else {
        return event.asLatest;
      }
    }

    case SubstrateNetwork.kusama: {
      const event = new KusamaBalancesTransferEvent(ctx);

      if (event.isV1020) {
        const [from, to, amount] = event.asV1020;
        return { from, to, amount };
      } else if (event.isV1050) {
        const [from, to, amount] = event.asV1050;
        return { from, to, amount };
      } else if (event.isV9130) {
        return event.asV9130;
      } else {
        return event.asLatest;
      }
    }

    default: {
      throw new Error('getTransferEvent::network not supported');
    }
  }
}

export default (network: SubstrateNetwork, tokenIndex: number) =>
  async (ctx: EventHandlerContext) => {
    const blockNumber = BigInt(ctx.block.height);
    const date = new Date(ctx.block.timestamp);
    const transfer = getTransferEvent(ctx, network);
    const amount = transfer.amount;
    const tip = ctx.extrinsic?.tip || 0n;
    const symbol = getRegistry(network).symbols[tokenIndex];
    const decimals = getRegistry(network).decimals[tokenIndex];
    const prefix = getRegistry(network).prefix;

    // sender
    const fromAddress = encodeAddress(network, transfer.from);
    const rootFromAccount = getAccountHex(transfer.from);

    const fromAccount = await getOrCreateAccount(ctx.store, SubstrateAccount, {
      id: fromAddress,
      rootAccount: rootFromAccount,
      network,
      prefix,
    });
    fromAccount.rootAccount = rootFromAccount;
    fromAccount.network = network;
    fromAccount.prefix = prefix;
    await ctx.store.save(fromAccount);

    const fromBalanceAccount = await getOrCreate(
      ctx.store,
      SubstrateBalance,
      `${fromAddress}:${symbol}`
    );

    fromBalanceAccount.network = network;
    fromBalanceAccount.symbol = symbol;
    fromBalanceAccount.decimals = decimals;
    fromBalanceAccount.rootAccount = rootFromAccount;
    fromBalanceAccount.account = fromAccount;
    fromBalanceAccount.totalTransfers =
      (fromBalanceAccount.totalTransfers || 0) + 1;
    fromBalanceAccount.balance = fromBalanceAccount.balance || 0n;
    fromBalanceAccount.balance -= transfer.amount;
    fromBalanceAccount.balance -= tip;
    fromBalanceAccount.lastTransferOutBlockNumber = blockNumber;
    fromBalanceAccount.lastTransferOutDate = date;

    if (!fromBalanceAccount.firstTransferOutBlockNumber) {
      fromBalanceAccount.firstTransferOutBlockNumber = blockNumber;
      fromBalanceAccount.firstTransferOutDate = date;
    }

    await ctx.store.save(fromBalanceAccount);

    // receiver
    const toAddress = encodeAddress(network, transfer.to);
    const rootToAccount = getAccountHex(transfer.to);

    const toAccount = await getOrCreateAccount(ctx.store, SubstrateAccount, {
      id: toAddress,
      rootAccount: rootToAccount,
      network,
      prefix,
    });
    await ctx.store.save(toAccount);

    const toBalanceAccount = await getOrCreate(
      ctx.store,
      SubstrateBalance,
      `${toAddress}:${symbol}`
    );

    toBalanceAccount.network = network;
    toBalanceAccount.symbol = symbol;
    toBalanceAccount.decimals = decimals;
    toBalanceAccount.rootAccount = rootToAccount;
    toBalanceAccount.account = toAccount;
    toBalanceAccount.totalTransfers =
      (toBalanceAccount.totalTransfers || 0) + 1;
    toBalanceAccount.balance = toBalanceAccount.balance || 0n;
    toBalanceAccount.balance += transfer.amount;
    toBalanceAccount.lastTransferInBlockNumber = blockNumber;
    toBalanceAccount.lastTransferInDate = date;

    if (!toBalanceAccount.firstTransferInBlockNumber) {
      toBalanceAccount.firstTransferInBlockNumber = blockNumber;
      toBalanceAccount.firstTransferInDate = date;
    }

    await ctx.store.save(toBalanceAccount);

    const transferModel = new SubstrateTransfer({
      id: `${network}:${blockNumber.toString()}:${ctx.event.indexInBlock}`,
      network,
      blockNumber,
      date,
      symbol,
      decimals,
      fromAccountBalanceAtBlock: fromBalanceAccount.balance,
      toAccountBalanceAtBlock: toBalanceAccount.balance,
      to: toBalanceAccount,
      from: fromBalanceAccount,
      amount,
      tip,
    });

    await ctx.store.save(transferModel);
  };