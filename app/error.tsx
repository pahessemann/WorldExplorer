"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="system-screen"><span className="system-orbit">!</span><h1>La boussole s’est égarée</h1><p>Vos trajets restent enregistrés sur cet appareil.</p><button onClick={reset}>Reprendre l’exploration</button></main>;
}
