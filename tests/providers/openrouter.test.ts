import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CardFormat } from "../../src/providers/types.js";

vi.mock("../../src/config.js", () => ({
  config: {
    openrouterApiKey: "test-key",
  },
}));

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mockCreate } };
  },
}));

const { OpenRouterProvider } = await import("../../src/providers/openrouter.js");

function makeRequest(format: CardFormat = "3x4", imageBuffer?: Buffer, userPrompt?: string) {
  return {
    imageBuffer: imageBuffer ?? Buffer.from("test-image-data"),
    userPrompt: userPrompt ?? "Make a product card",
    format,
  };
}

function makeSuccessResponse(base64Data: string) {
  return {
    choices: [
      {
        message: {
          images: [
            { image_url: { url: `data:image/png;base64,${base64Data}` } },
          ],
        },
      },
    ],
  };
}

describe("providers/openrouter", () => {
  let provider: InstanceType<typeof OpenRouterProvider>;

  beforeEach(() => {
    provider = new OpenRouterProvider();
    mockCreate.mockReset();
  });

  describe("generate", () => {
    it("sends correct API request (model, format, image)", async () => {
      const base64Result = Buffer.from("result-image").toString("base64");
      mockCreate.mockResolvedValue(makeSuccessResponse(base64Result));

      await provider.generate(makeRequest("3x4"));

      expect(mockCreate).toHaveBeenCalledOnce();
      const args = mockCreate.mock.calls[0][0];

      expect(args.model).toBe("google/gemini-3.1-flash-image-preview");
      expect(args.modalities).toEqual(["image", "text"]);
      expect(args.image_config).toEqual({
        aspect_ratio: "3:4",
        image_size: "1K",
      });

      // Verify message structure
      expect(args.messages).toHaveLength(1);
      expect(args.messages[0].role).toBe("user");
      expect(args.messages[0].content).toHaveLength(2);
      expect(args.messages[0].content[0].type).toBe("text");
      expect(args.messages[0].content[0].text).toContain("Make a product card");
      expect(args.messages[0].content[1].type).toBe("image_url");
      expect(args.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it("maps format to aspect_ratio (1x1→1:1, 3x4→3:4, 4x3→4:3, 9x16→9:16)", async () => {
      const base64Result = Buffer.from("result").toString("base64");
      mockCreate.mockResolvedValue(makeSuccessResponse(base64Result));

      const mapping: Record<CardFormat, string> = {
        "1x1": "1:1",
        "3x4": "3:4",
        "4x3": "4:3",
        "9x16": "9:16",
      };

      for (const [format, expectedRatio] of Object.entries(mapping)) {
        mockCreate.mockClear();
        await provider.generate(makeRequest(format as CardFormat));

        const args = mockCreate.mock.calls[0][0];
        expect(args.image_config.aspect_ratio).toBe(expectedRatio);
      }
    });

    it("converts Buffer to base64 and back", async () => {
      const inputData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const inputBuffer = Buffer.from(inputData);
      const expectedInputBase64 = inputBuffer.toString("base64");

      const outputData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const outputBuffer = Buffer.from(outputData);
      const outputBase64 = outputBuffer.toString("base64");

      mockCreate.mockResolvedValue(makeSuccessResponse(outputBase64));

      const result = await provider.generate(makeRequest("1x1", inputBuffer));

      // Verify input was encoded as base64 in the request
      const args = mockCreate.mock.calls[0][0];
      const sentUrl = args.messages[0].content[1].image_url.url;
      expect(sentUrl).toBe(`data:image/jpeg;base64,${expectedInputBase64}`);

      // Verify output was decoded from base64 correctly
      expect(result.imageBuffer).toEqual(outputBuffer);
    });

    it("throws error when API returns empty response", async () => {
      mockCreate.mockResolvedValue({ choices: [] });

      await expect(provider.generate(makeRequest())).rejects.toThrow(
        "OpenRouter API returned no response",
      );
    });

    it("throws error when API returns no image", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { images: [] } }],
      });

      await expect(provider.generate(makeRequest())).rejects.toThrow(
        "OpenRouter API returned no image in response",
      );
    });

    it("throws error on invalid data URL", async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              images: [
                { image_url: { url: "data:image/png;base64," } },
              ],
            },
          },
        ],
      });

      await expect(provider.generate(makeRequest())).rejects.toThrow(
        "Invalid data URL format from OpenRouter",
      );
    });
  });
});
