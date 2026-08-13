import { describe, expect, it } from "vitest";
import { buildVideoCurl } from "@/lib/byteplus";
import { VIDEO_EDIT_MODEL } from "./types";
import { findVideoModel } from "@/lib/studio/models";

/**
 * Seedance 2.5's wire format, checked against the vendor's own reference
 * request. Not a mock of our types — the shape BytePlus documented.
 */
describe("Seedance 2.5 request shape", () => {
  const body = (params: Parameters<typeof buildVideoCurl>[0]) =>
    JSON.parse(
      buildVideoCurl(params).split("-d '")[1].replace(/'\\''/g, "'").slice(0, -1),
    ) as Record<string, unknown>;

  it("routes 2.5 to the top-level-fields schema, like the rest of the 2.x family", () => {
    // isSeedance2() keys off the `dreamina-seedance-2-` prefix, which 2.5
    // satisfies — so no schema branch was needed for it at all.
    const out = body({
      prompt: "a cup on a table",
      model: VIDEO_EDIT_MODEL,
      duration: 11,
      ratio: "16:9",
      audio: true,
    });
    expect(out.model).toBeTruthy();
    expect(out.duration).toBe(11);
    expect(out.ratio).toBe("16:9");
    // The 2.x family names it generate_audio on the wire, not `audio`.
    expect(out.generate_audio).toBe(true);
    // 1.5's --flag tokens must NOT appear.
    expect(String((out.content as Array<{ text?: string }>)[0].text)).not.toContain("--duration");
  });

  it("emits an audio reference as its own content item with the documented role", () => {
    const out = body({
      prompt: "follow the beat",
      model: VIDEO_EDIT_MODEL,
      audios: [{ url: "https://cdn/track.mp3", role: "reference_audio" }],
    });
    const content = out.content as Array<Record<string, unknown>>;
    const audio = content.find((c) => c.type === "audio_url");
    expect(audio).toBeTruthy();
    expect(audio!.audio_url).toEqual({ url: "https://cdn/track.mp3" });
    expect(audio!.role).toBe("reference_audio");
  });

  it("carries images, video and audio references together", () => {
    // The vendor's example passes all three in one request.
    const out = body({
      prompt: "use Video 1's framing and Audio 1 as the music",
      model: VIDEO_EDIT_MODEL,
      images: [{ url: "https://cdn/a.jpg", role: "reference_image" }],
      videos: [{ url: "https://cdn/v.mp4", role: "reference_video" }],
      audios: [{ url: "https://cdn/a.mp3", role: "reference_audio" }],
    });
    const kinds = (out.content as Array<{ type: string }>).map((c) => c.type);
    expect(kinds).toEqual(["text", "image_url", "video_url", "audio_url"]);
  });

  it("is registered with capabilities that match the documented request", () => {
    const model = findVideoModel(VIDEO_EDIT_MODEL);
    expect(model).toBeTruthy();
    // The reference request asks for duration 11, which the 2.0 ladder omits.
    expect(model!.caps.durations).toContain(11);
    expect(model!.caps.audio).toBe(true);
    expect(model!.caps.referenceMode).toBe(true);
  });
});

/**
 * The video-editing task type, learned from the API's own rejection:
 *
 *   "`ratio` must be `adaptive`. [1] `duration` must be -1."
 *
 * Seedance classifies the task from the PROMPT, so any request that reads as
 * "edit this video" inherits these rules whether or not we opted in.
 */
describe("video-editing task type", () => {
  const body = (params: Parameters<typeof buildVideoCurl>[0]) =>
    JSON.parse(
      buildVideoCurl(params).split("-d '")[1].replace(/'\\''/g, "'").slice(0, -1),
    ) as Record<string, unknown>;

  it("passes adaptive ratio and -1 duration through to the wire", () => {
    const out = body({
      prompt: "Recreate the full 6-second video shown in Video 1",
      model: VIDEO_EDIT_MODEL,
      ratio: "adaptive",
      duration: -1,
      videos: [{ url: "https://cdn/src.mp4", role: "reference_video" }],
    });
    expect(out.ratio).toBe("adaptive");
    expect(out.duration).toBe(-1);
  });

  it("carries the source clip as a reference_video alongside marked frames", () => {
    // The pairing that makes this an EDIT rather than a fresh generation.
    const out = body({
      prompt: "edit it",
      model: VIDEO_EDIT_MODEL,
      ratio: "adaptive",
      duration: -1,
      videos: [{ url: "https://cdn/src.mp4", role: "reference_video" }],
      images: [{ url: "https://cdn/marked.jpg", role: "reference_image" }],
    });
    const content = out.content as Array<Record<string, unknown>>;
    expect(content.find((c) => c.type === "video_url")?.role).toBe("reference_video");
    expect(content.find((c) => c.type === "image_url")?.role).toBe("reference_image");
  });
});
