// src/modules/challenges/challenges.types.ts
var ChallengesQueryStatus = /* @__PURE__ */ ((ChallengesQueryStatus2) => {
  ChallengesQueryStatus2["Active"] = "Active";
  ChallengesQueryStatus2["Success"] = "Success";
  return ChallengesQueryStatus2;
})(ChallengesQueryStatus || {});
var BidsQueryType = /* @__PURE__ */ ((BidsQueryType2) => {
  BidsQueryType2["Averted"] = "Averted";
  BidsQueryType2["Succeeded"] = "Succeeded";
  return BidsQueryType2;
})(BidsQueryType || {});

// src/modules/auth/auth.types.ts
var NOTIFICATION_ALERT_TYPES = [
  "mintingUpdates",
  "positionExpiry",
  "priceAlerts",
  "challenge",
  "allPositions",
  "positionProposal",
  "minterProposal",
  "ccipProposal",
  "leadrateProposal",
  "weeklyInfo",
  "equityEvents"
];
export {
  BidsQueryType,
  ChallengesQueryStatus,
  NOTIFICATION_ALERT_TYPES
};
