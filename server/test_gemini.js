import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log("Using API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "undefined");

if (!apiKey) {
  console.error("No API Key found!");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function testModel(modelName) {
  console.log(`Testing model: ${modelName}`);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Hello! What is your name and model identifier?");
    const response = await result.response;
    const text = response.text();
    console.log(`Success for ${modelName}! Response:`, text);
    return true;
  } catch (error) {
    console.error(`Failed for ${modelName}:`, error.message);
    return false;
  }
}

async function run() {
  const models = ["gemini-1.5-pro-latest", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-flash"];
  for (const model of models) {
    await testModel(model);
    console.log("-------------------");
  }
}

run();
