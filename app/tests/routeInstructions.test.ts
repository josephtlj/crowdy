import assert from "node:assert/strict";
import { test } from "node:test";
import { translateInstruction } from "../src/i18n/routeInstructions";

const zh = (text: string) => translateInstruction(text, "zh");

test("english is passed through unchanged", () => {
  assert.equal(translateInstruction("Turn Left Onto Punggol Road", "en"), "Turn Left Onto Punggol Road");
});

test("actions are translated and street names kept", () => {
  assert.equal(zh("Head North On Punggol Road"), "沿 Punggol Road 向北出发");
  assert.equal(zh("Turn Left To Stay On Punggol Road"), "左转，继续沿 Punggol Road 行进");
  assert.equal(zh("Turn Left Onto Punggol Road"), "左转，进入 Punggol Road");
  assert.equal(zh("Merge Right Onto Hill Street"), "向右并入 Hill Street");
  assert.equal(zh("Keep Left At Kampong Bahru Road"), "在 Kampong Bahru Road 靠左");
  assert.equal(zh("You Have Arrived At Punggol Central"), "已到达 Punggol Central");
  assert.equal(zh("Continue Straight To Stay On Bedok North Avenue 3"), "继续直行，沿 Bedok North Avenue 3 行进");
});

test("actions without a street are translated", () => {
  assert.equal(zh("Head Northwest"), "向西北出发");
  assert.equal(zh("Make A Slight Right"), "稍向右转");
  assert.equal(zh("Make A U-turn"), "掉头");
});

test("transit legs are translated", () => {
  assert.equal(zh("Walk to Destination"), "步行至目的地");
  assert.equal(zh("Walk to Punggol MRT Station"), "步行至 Punggol MRT Station");
  assert.equal(zh("NE17 · Punggol MRT Station → Outram Park MRT Station"), "NE17 · Punggol MRT Station → Outram Park MRT Station");
});

test("an unrecognised sentence stays in english", () => {
  assert.equal(zh("Board The Ferry At Changi Point"), "Board The Ferry At Changi Point");
  assert.equal(zh("Head Upwards"), "Head Upwards");
});
