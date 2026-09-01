/**
 * P1 "honest short-game review": identifying the opening family a real
 * game actually reached, and offering one real, textbook strategic idea
 * for it — never a fabricated claim about what this specific learner did
 * right or wrong. Deliberately conservative: an opening is only ever
 * named when the played SAN sequence is an exact prefix match against a
 * known line (the longest one that matches, so "Ruy Lopez" is preferred
 * over a shorter, less specific match when both apply) — no fuzzy or
 * partial matching, so a genuinely unrecognized sequence returns nothing
 * rather than a guess.
 */

interface OpeningEntry {
  name: string;
  /** SAN moves in played order (White's 1st, Black's 1st, White's 2nd, ...). */
  moves: string[];
  /** A real, standard characterization of the opening's typical plan — never a claim about this specific game. */
  idea: string;
}

// Ordered roughly by move-count (longest lines last isn't required — the
// matcher below always prefers the longest actual match, checked across
// every entry).
const OPENING_BOOK: OpeningEntry[] = [
  {
    name: "Ruy Lopez",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    idea: "White typically follows up with O-O and re-routing the bishop toward b3, building long-term pressure on e5 rather than an immediate attack.",
  },
  {
    name: "Italian Game",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
    idea: "A common follow-up is c3 and d4, building a strong pawn center before castling.",
  },
  {
    name: "Scotch Game",
    moves: ["e4", "e5", "Nf3", "Nc6", "d4"],
    idea: "White opens the center immediately, trading a central pawn for faster piece activity.",
  },
  {
    name: "Vienna Game",
    moves: ["e4", "e5", "Nc3"],
    idea: "White develops the knight before committing the f-pawn, keeping the option of a later f4 open.",
  },
  {
    name: "King's Gambit",
    moves: ["e4", "e5", "f4"],
    idea: "White offers a pawn early for rapid development and open lines toward Black's king.",
  },
  {
    name: "Sicilian Defence",
    moves: ["e4", "c5"],
    idea: "Black fights for the center asymmetrically rather than meeting e4 with ...e5 — the resulting positions are usually sharper for both sides.",
  },
  {
    name: "French Defence",
    moves: ["e4", "e6"],
    idea: "The position often becomes closed early — piece activity behind the pawn chain matters more than a quick attack.",
  },
  {
    name: "Caro-Kann Defence",
    moves: ["e4", "c6"],
    idea: "Black keeps a solid pawn structure while still contesting the center with a soon-to-follow ...d5.",
  },
  {
    name: "Scandinavian Defence",
    moves: ["e4", "d5"],
    idea: "Black regains the pawn quickly (often ...Qxd5), then focuses on fast, safe development rather than holding the extra pawn.",
  },
  {
    name: "Pirc Defence",
    moves: ["e4", "d6"],
    idea: "Black delays central pawn moves, planning to challenge White's center with pieces first.",
  },
  {
    name: "Alekhine's Defence",
    moves: ["e4", "Nf6"],
    idea: "Black invites White's pawns forward, planning to attack the resulting overextended center later.",
  },
  {
    name: "Queen's Gambit",
    moves: ["d4", "d5", "c4"],
    idea: "White offers a wing pawn to gain central control and faster development, not to keep the pawn.",
  },
  {
    name: "King's Indian Defence",
    moves: ["d4", "Nf6", "c4", "g6"],
    idea: "Black lets White build a big center, planning a later ...e5 or ...c5 break to challenge it.",
  },
  {
    name: "London System",
    moves: ["d4", "d5", "Nf3", "Nf6", "Bf4"],
    idea: "A solid, repeatable setup — the same piece placement works against many different Black replies.",
  },
  {
    name: "English Opening",
    moves: ["c4"],
    idea: "A flexible flank opening — the center is contested indirectly rather than occupied immediately.",
  },
];

export interface IdentifiedOpening {
  name: string;
  idea: string;
}

/**
 * Exact-prefix match only — the longest matching entry wins. `sanMoves`
 * is every SAN move actually played, in order, both colors interleaved
 * (i.e. `review.moves.map(m => m.playedMove)`).
 */
export function identifyOpening(sanMoves: string[]): IdentifiedOpening | null {
  let best: OpeningEntry | null = null;
  for (const entry of OPENING_BOOK) {
    if (entry.moves.length > sanMoves.length) continue;
    const isPrefix = entry.moves.every((san, i) => sanMoves[i] === san);
    if (isPrefix && (!best || entry.moves.length > best.moves.length)) best = entry;
  }
  return best ? { name: best.name, idea: best.idea } : null;
}
