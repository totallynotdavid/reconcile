"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Gate } from "@/components/Hydrate";
import { Session } from "@/components/Session";
import { cardsForConcept } from "@/content";
import type { Card } from "@/content/types";
import { dueConcepts } from "@/learning/leitner";
import { rng } from "@/learning/session";
import { useProgress } from "@/learning/store";

const MAX_CARDS = 8;

export default function Review() {
  return (
    <Gate>
      <ReviewRound />
    </Gate>
  );
}

function ReviewRound() {
  const concepts = useProgress((s) => s.concepts);
  const finishReview = useProgress((s) => s.finishReview);
  const [seed] = useState(() => Date.now());
  const [snapshot] = useState(() => concepts);

  /** One card per due concept, weakest first. Same-topic cards are mixed in by the shuffle of concepts of equal box. */
  const cards = useMemo(() => {
    const rand = rng(seed);
    return dueConcepts(snapshot, seed)
      .slice(0, MAX_CARDS)
      .map((slug): Card => {
        const pool = cardsForConcept(slug);
        return pool[Math.floor(rand() * pool.length)];
      });
  }, [snapshot, seed]);

  if (cards.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold">Nothing due</h1>
        <p className="mt-2 text-sm">Finish a level to start the schedule. Concepts come back after 1, 2, 4, 8 and 16 days.</p>
        <Link href="/" className="btn mt-4 inline-block px-4">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Review</h1>
      <Session
        cards={cards}
        seed={seed}
        gated={false}
        onDone={finishReview}
        footer={() => (
          <Link href="/" className="btn px-4">
            Home
          </Link>
        )}
      />
    </div>
  );
}
