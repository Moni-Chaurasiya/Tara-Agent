import dotenv from "dotenv";
dotenv.config();

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
});

async function test() {
    console.log("Key exists:", !!process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    console.log("Key starts with:", process.env.GOOGLE_GENERATIVE_AI_API_KEY?.slice(0, 8));

    try {
        const result = await generateText({
            model: google("gemini-2.0-flash") as any,
            prompt: "Say hello in one word",
        });
        console.log("API works:", result.text);
    } catch (e) {
        console.error("API error:", e);
    }
}

test();