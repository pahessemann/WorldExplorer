import Link from "next/link";

export default function NotFound() {
  return <main className="system-screen"><span className="system-orbit">?</span><h1>Zone inconnue</h1><p>Cette page ne figure pas encore sur la carte.</p><Link href="/">Retour à l’exploration</Link></main>;
}
