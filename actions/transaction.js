"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { GoogleGenAI } from "@google/genai";
import aj from "@/lib/arcjet";
import { request } from "@arcjet/next";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const serializeAmount = (obj) => ({
  ...obj,
  amount: obj.amount.toNumber(),
});

// 🚀 Create a new transaction and update balance
export async function createTransaction(data) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const req = await request();
    const decision = await aj.protect(req, { userId, requested: 1 });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        const { remaining, reset } = decision.reason;
        console.error({
          code: "RATE_LIMIT_EXCEEDED",
          details: { remaining, resetInSeconds: reset },
        });
        throw new Error("Too many requests. Please try again later.");
      }
      throw new Error("Request blocked");
    }

    const user = await db.user.findUnique({ where: { clerkUserId: userId } });
    if (!user) throw new Error("User not found");

    const account = await db.account.findUnique({
      where: { id: data.accountId, userId: user.id },
    });
    if (!account) throw new Error("Account not found");

    const balanceChange = data.type === "EXPENSE" ? -data.amount : data.amount;
    const newBalance = account.balance.toNumber() + balanceChange;

    const transaction = await db.$transaction(async (tx) => {
      const newTransaction = await tx.transaction.create({
        data: {
          ...data,
          userId: user.id,
          nextRecurringDate:
            data.isRecurring && data.recurringInterval
              ? calculateNextRecurringDate(data.date, data.recurringInterval)
              : null,
        },
      });

      await tx.account.update({
        where: { id: data.accountId },
        data: { balance: newBalance },
      });

      return newTransaction;
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${transaction.accountId}`);

    return { success: true, data: serializeAmount(transaction) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ✅ Scan a receipt image and return transaction fields
export async function scanReceipt(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64String = Buffer.from(arrayBuffer).toString("base64");

    const prompt = `
      Analyze this receipt image and extract the following information in JSON format:
      - Total amount (just the number)
      - Date (in ISO format)
      - Description or items purchased (brief summary)
      - Merchant/store name
      - Suggested category (one of: housing, transportation, groceries, utilities, entertainment, food, shopping, healthcare, education, personal, travel, insurance, gifts, bills, other-expense)

      Only respond with valid JSON in this exact format:
      {
        "amount": number,
        "date": "ISO date string",
        "description": "string",
        "merchantName": "string",
        "category": "string"
      }

      If it's not a receipt, return an empty object.
    `;

    const contents = [
      {
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      },
      prompt,
    ];

    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
    });

    const text = await result.text;
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();
    const data = JSON.parse(cleanedText);

    return {
      amount: parseFloat(data.amount),
      date: new Date(data.date),
      description: data.description,
      category: data.category,
      merchantName: data.merchantName,
    };
  } catch (error) {
    console.error("Error scanning receipt:", error);
    throw new Error("Failed to scan receipt");
  }
}

// 🧠 AI Transaction from Prompt
export async function createTransactionFromPrompt(prompt) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await db.user.findUnique({ where: { clerkUserId: userId } });
    if (!user) throw new Error("User not found");

    const defaultAccount = await db.account.findFirst({
      where: { userId: user.id, isDefault: true },
    });
    if (!defaultAccount) throw new Error("No default account found");

    const aiPrompt = `
      Analyze the following user input and extract the transaction details in JSON format:
      - Type: INCOME or EXPENSE
      - Amount (number only)
      - Date (ISO format, use today if not specified)
      - Description (short summary)
      - Category (one of: housing, transportation, groceries, utilities, entertainment, food, shopping, healthcare, education, personal, travel, insurance, gifts, bills, other-expense, salary, other-income)

      Only respond with valid JSON in this exact format:
      {
        "type": "INCOME" | "EXPENSE",
        "amount": number,
        "date": "ISO date string",
        "description": "string",
        "category": "string"
      }

      User input: "${prompt}"
    `;

    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [aiPrompt],
    });

    const text = await result.text;
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();
    let data;
    try {
      data = JSON.parse(cleanedText);
    } catch {
      throw new Error("Could not parse transaction details from prompt");
    }

    if (!data.amount || !data.type || !data.category) {
      throw new Error("Incomplete transaction details extracted");
    }

    const transactionData = {
      accountId: defaultAccount.id,
      type: data.type.toUpperCase(),
      amount: Number(data.amount),
      category: data.category,
      description: data.description || data.category,
      date: data.date ? new Date(data.date) : new Date(),
      isRecurring: false,
    };

    return await createTransaction(transactionData);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 🔁 Calculate next recurring date
function calculateNextRecurringDate(startDate, interval) {
  const date = new Date(startDate);
  switch (interval) {
    case "DAILY": date.setDate(date.getDate() + 1); break;
    case "WEEKLY": date.setDate(date.getDate() + 7); break;
    case "MONTHLY": date.setMonth(date.getMonth() + 1); break;
    case "YEARLY": date.setFullYear(date.getFullYear() + 1); break;
  }
  return date;
}
