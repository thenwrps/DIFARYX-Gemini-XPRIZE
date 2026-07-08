import { VertexAI } from "@google-cloud/vertexai"

const vertex = new VertexAI({
    project: "project-5d203db1-ad48-42a6-b3c",
    location: "us-central1",
})
const model = vertex.getGenerativeModel({ model: "gemini-2.0-flash" })

const res = await model.generateContent("Reply 'OK' if you can read this.")
console.log(res.response.candidates[0].content.parts[0].text)