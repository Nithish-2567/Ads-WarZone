import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // 1. Get the key from the SERVER environment
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API Key not configured on server." });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const { prompt } = req.body; // Get the user's message from React
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 2. Send the AI response back to React
    return res.status(200).json({ text: responseText });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
