const { actualApi } = require('./actual-api');
const { ask } = require('./openai');
const { syncAccountsBeforeClassify } = require('./config');
const { suppressConsoleLogsAsync } = require('./utils');

const NOTES_NOT_GUESSED = 'actual-ai could not guess this category';
const NOTES_GUESSED = 'actual-ai guessed this category';

// const ADDITIONAL_EXCLUDES = process.env.ADDITIONAL_EXCLUDES.split(',');

function findUUIDInString(str) {
  const regex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/g;
  const matchResult = str.match(regex);
  return matchResult ? matchResult[0] : null;
}

async function syncAccounts() {
  console.log('Syncing bank accounts');
  try {
    await suppressConsoleLogsAsync(async () => actualApi.runBankSync());
    console.log('Bank accounts synced');
  } catch (error) {
    console.error('Error syncing bank accounts:', error);
  }
}

async function processTransactions() {
  if (syncAccountsBeforeClassify) {
    await syncAccounts();
  }

  const categoryGroups = await actualApi.getCategoryGroups();
  const categories = await actualApi.getCategories();
  const payees = await actualApi.getPayees();
  const transactions = await actualApi.getTransactions();

  const uncategorizedTransactions = transactions.filter(
    (transaction) => !transaction.category
      && transaction.transfer_id === null
      && transaction.starting_balance_flag !== true
      // This line handles the null `notes`
      && (transaction.notes ? !transaction.notes.includes(NOTES_NOT_GUESSED) : true),
    // && ADDITIONAL_EXCLUDES.some((exclude) => transaction.imported_payee.includes(exclude)),
  );

  console.log(uncategorizedTransactions);

  async function processTransaction(transaction, index, total) {
    console.log(`${index + 1}/${total} Processing transaction ${transaction.imported_payee} / ${transaction.notes} / ${transaction.amount}`);

    // If it's a parent transaction, process each child transaction
    if (transaction.is_parent) {
      for (const child of transaction.subtransactions) {
        await processTransaction(child, index, total); // Recursive call for each child
      }
      return; // Skip the rest of the processing for the parent transaction
    }

    // Processing logic for a "normal" transaction or child transaction
    const guess = await ask(categoryGroups, transaction, payees);
    const guessUUID = findUUIDInString(guess);
    const guessCategory = categories.find((category) => category.id === guessUUID);

    if (!guessCategory) {
      console.warn(`${index + 1}/${total} OpenAI could not classify the transaction. OpenAI's guess: ${guess}`);
      await actualApi.updateTransaction(transaction.id, {
        notes: `${transaction.notes} | ${NOTES_NOT_GUESSED}`,
      });
      return;
    }
    console.log(`${index + 1}/${total} Guess: ${guessCategory.name}`);

    await actualApi.updateTransaction(transaction.id, {
      category: guessCategory.id,
      notes: `${transaction.notes} | ${NOTES_GUESSED}`,
    });
  }

 
  for (let i = 0; i < uncategorizedTransactions.length; i++) {
    await processTransaction(uncategorizedTransactions[i], i, uncategorizedTransactions.length);
  }
}
module.exports = {
  processTransactions,
};
