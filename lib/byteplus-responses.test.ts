import { describe, expect, it } from "vitest";
import {
  buildResponsesBody,
  extractResponsesText,
  shouldUseResponsesApi,
} from "./byteplus";

describe("BytePlus responses helpers", () => {
  it("uses the responses API for Seed 2.0 Pro unless explicitly overridden", () => {
    expect(shouldUseResponsesApi("seed-2-0-pro-260328")).toBe(true);
    expect(shouldUseResponsesApi("seed-2-0-lite-260228")).toBe(false);
    expect(shouldUseResponsesApi("seed-2-0-pro-260328", "chat")).toBe(false);
    expect(shouldUseResponsesApi("seed-2-0-lite-260228", "responses")).toBe(true);
  });

  it("builds an OpenAI-style responses body for SeedPro vision prompts", () => {
    expect(
      buildResponsesBody({
        model: "seed-2-0-pro-260328",
        instruction: "Analyze the frame.",
        content: [
          { type: "input_image", image_url: "data:image/jpeg;base64,abc" },
          { type: "input_text", text: "Return a Seedance prompt." },
        ],
        maxTokens: 300,
        temperature: 0.2,
      }),
    ).toMatchObject({
      model: "seed-2-0-pro-260328",
      stream: false,
      max_output_tokens: 300,
      temperature: 0.2,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Analyze the frame." },
            { type: "input_image", image_url: "data:image/jpeg;base64,abc" },
            { type: "input_text", text: "Return a Seedance prompt." },
          ],
        },
      ],
    });
  });

  it("extracts text from common responses API shapes", () => {
    expect(extractResponsesText({ output_text: "direct text" })).toBe("direct text");
    expect(
      extractResponsesText({
        output: [
          {
            content: [
              { type: "output_text", text: "first " },
              { type: "output_text", text: "second" },
            ],
          },
        ],
      }),
    ).toBe("first second");
  });
});
