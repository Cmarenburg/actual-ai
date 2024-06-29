const OpenAI = require('openai');
const { model } = require('./config');

const openai = new OpenAI({});

function generatePrompt(categoryGroups, transaction, payees) {
  let prompt = 'Given I want to categorize the bank transactions in following categories:\n';

  categoryGroups.forEach((categoryGroup) => {
    categoryGroup.categories.forEach((category) => {
      prompt += `* ${category.name} (${categoryGroup.name}) (ID: "${category.id}") \n`;
    });
  });

  const payeeName = payees.find((payee) => payee.id === transaction.payee_id)?.name;

  prompt += 'Please categorize the following transaction: \n';
  prompt += `* Amount: ${Math.abs(transaction.amount)}\n`;
  prompt += `* Type: ${transaction.amount > 0 ? 'Income' : 'Outcome'}\n`;
  prompt += `* Description: ${transaction.notes}\n`;
  if (payeeName) {
    prompt += `* Payee: ${payeeName}\n`;
    prompt += `* Payee RAW: ${transaction.imported_payee}\n`;
  } else {
    prompt += `* Payee: ${transaction.imported_payee}\n`;
  }

  // The merchant category pair is seperated by a period, each pairing is seperated by comma
  // example: Soberys.Grocery,Walmart.Grocery,Eastlink.wireless,Gianttiger.Grocery
  if (process.env.MERCHANT_CATEGORY_MAP) {
    const pairingsString = process.env.MERCHANT_CATEGORY_MAP;
    const pairs = pairingsString.split(',');

    // Iterate over the pairs using forEach
    pairs.forEach((pair) => {
      // Destructure the merchant and category from the pair
      const [merchant, category] = pair.split('.');
      // Append each pair to the prompt variable followed by a newline for readability
      prompt += `"${merchant}" => "${category}"\n`;
      // Alternatively, if you just want to append without newline, use:
      // prompt += pair;
    });

    prompt += 'IF NO EXPLICIT MATCHING IGNORE AND PROCEED WITH NORMAL LOGIC. CONTAINing IS OKAY.';
  }

  prompt += 'ANSWER BY A CATEGORY ID.DO NOT WRITE THE WHOLE SENTENCE. Do not guess, if you don\'t know answer: "idk".';

  return prompt;
}

async function callOpenAI(prompt) {
  const response = await openai.completions.create({
    model,
    prompt,
    temperature: 0.1,
    max_tokens: 50,
  });

  let guess = response.choices[0].text;
  guess = guess.replace(/(\r\n|\n|\r)/gm, '');

  return guess;
}

async function ask(categoryGroups, transaction, payees) {
  const prompt = generatePrompt(categoryGroups, transaction, payees);

  return callOpenAI(prompt);
}

module.exports = {
  ask,
};
