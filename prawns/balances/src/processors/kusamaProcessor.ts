import { SubstrateProcessor } from '@subsquid/substrate-processor';
import balanceTransferHandler from '../handlers/balances.transfer.event';
import treasuryDepositHandler from '../handlers/treasury.deposit.event';
import { SubstrateNetwork } from '../model';

const processor = new SubstrateProcessor('litentry_squid_balances_kusama');

processor.setTypesBundle('kusama');
processor.setBatchSize(500);
processor.setIsolationLevel('REPEATABLE READ');
processor.setDataSource({
  archive: 'https://kusama.indexer.gc.subsquid.io/v4/graphql',
  chain: 'wss://kusama.api.onfinality.io/public-ws',
});
processor.addEventHandler(
  'balances.Transfer',
  balanceTransferHandler(SubstrateNetwork.kusama, 0)
);
processor.addEventHandler(
  'treasury.Deposit',
  treasuryDepositHandler(SubstrateNetwork.kusama, 0)
);

processor.run();
