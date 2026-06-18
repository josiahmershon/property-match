type ChatMessage =
  | {
      role: "system";
      content: string;
    }
  | {
      role: "user";
      content:
        | string
        | Array<
            | { type: "text"; text: string }
            | { type: "image_url"; image_url: { url: string } }
          >;
    };

export function assertOpenAiConfigured() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!process.env.OPENAI_MODEL) {
    throw new Error("OPENAI_MODEL is not configured.");
  }
}

export async function createJsonChatCompletion<T>(messages: ChatMessage[]): Promise<T> {
  assertOpenAiConfigured();

  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const input = messages
    .filter((message) => message.role === "user")
    .map((message) => ({
      role: "user",
      content:
        typeof message.content === "string"
          ? `Return JSON only.\n\n${message.content}`
          : [
              {
                type: "input_text",
                text: "Return JSON only.",
              },
              ...message.content.map((item) => {
              if (item.type === "text") {
                return {
                  type: "input_text",
                  text: item.text,
                };
              }

              return {
                type: "input_image",
                image_url: item.image_url.url,
              };
            }),
            ],
    }));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      instructions,
      input,
      text: {
        format: { type: "json_object" },
      },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const content =
    data.output_text ??
    data.output
      ?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
      ?.map((item: { text?: string }) => item.text)
      ?.filter(Boolean)
      ?.join("");

  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  return JSON.parse(content) as T;
}
