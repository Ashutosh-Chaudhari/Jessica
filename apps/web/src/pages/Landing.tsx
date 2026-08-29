import { Link } from "react-router";
import { Button } from "../components/Button";

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.35em] text-zinc-500">
        The Communicator
      </p>
      <h1 className="mt-6 font-mono text-6xl font-bold tracking-tight text-zinc-50 sm:text-7xl">
        JESSICA
      </h1>
      <div className="mt-8 space-y-2">
        <p className="text-lg text-zinc-300">Speak about anything.</p>
        <p className="text-lg text-zinc-300">Think faster.</p>
        <p className="text-lg text-zinc-300">Communicate better.</p>
      </div>
      <Link to="/signup" className="mt-12">
        <Button className="px-10 py-3 text-base tracking-wide">START</Button>
      </Link>
      <p className="mt-6 text-sm text-zinc-500">
        Already have an account?{" "}
        <Link to="/login" className="text-emerald-300 hover:text-emerald-200">
          Log in
        </Link>
      </p>
    </div>
  );
}
