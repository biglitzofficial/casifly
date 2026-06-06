import React from 'react';
import { Account, Customer, Transaction, Wallet } from '../types';
import { isSwipePayInflow, isSwipePayOutflow } from '../lib/swipeTxnEconomics';
import { TransactionEditModal } from './TransactionEditModal';
import { SwipePayEditModal } from './SwipePayEditModal';

type Props = {
  transaction: Transaction;
  accounts: Account[];
  customers: Customer[];
  wallets: Wallet[];
  transactions: Transaction[];
  formatCurrency: (n: number) => string;
  onClose: () => void;
  onSave: (
    id: string,
    patch: {
      description: string;
      date: string;
      entries: Transaction['entries'];
      metadata?: Transaction['metadata'];
    },
  ) => void | Promise<void>;
};

export function TransactionEditRouter(props: Props) {
  const { transaction, customers, wallets, transactions, formatCurrency, onClose, onSave } = props;
  const useSwipeForm =
    transaction.type === 'SWIPE_PAY' &&
    (isSwipePayInflow(transaction) || isSwipePayOutflow(transaction));

  if (useSwipeForm) {
    return (
      <SwipePayEditModal
        transaction={transaction}
        customers={customers}
        wallets={wallets}
        transactions={transactions}
        formatCurrency={formatCurrency}
        onClose={onClose}
        onSave={onSave}
      />
    );
  }

  return (
    <TransactionEditModal
      transaction={transaction}
      accounts={props.accounts}
      formatCurrency={formatCurrency}
      onClose={onClose}
      onSave={(id, patch) => onSave(id, patch)}
    />
  );
}
