import Link from "next/link";
import { loadUnitLessons } from "../lib/lessons";

export default function HomePage() {
  const lessons = loadUnitLessons("meet-the-pieces");

  return (
    <main style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1>MoveWise</h1>
      <p style={{ opacity: 0.7 }}>Learn how to think during a chess game.</p>
      <p>
        <Link href="/play">Play vs. Stockfish →</Link>
      </p>
      <h2>Meet the Pieces</h2>
      <ol style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 20 }}>
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link href={`/learn/${lesson.id}`}>{lesson.title}</Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
