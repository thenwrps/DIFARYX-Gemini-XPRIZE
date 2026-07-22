import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

// Since server/.env is what we want, let's make sure we log the keys
const apiKey = process.env.MIMO_API_KEY;
const baseURL = process.env.MIMO_BASE_URL;

console.log("Using MiMo API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "undefined");
console.log("Using MiMo Base URL:", baseURL);

if (!apiKey || !baseURL) {
  console.error("MIMO_API_KEY or MIMO_BASE_URL is missing!");
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL
});

async function run() {
  try {
    console.log("Calling MiMo completions...");
    const response = await client.chat.completions.create({
      model: "mimo-v2.5",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant."
        },
        {
          role: "user",
          content: "Hello! What is your model identifier?"
        }
      ]
    });
    console.log("Success! Response:", response.choices?.[0]?.message?.content);
  } catch (error) {
    console.error("MiMo failed:", error.message);
  }
}

run();
