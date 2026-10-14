import { useEffect, useState } from "react";

import { Countdown } from "./components/Countdown";
import { GameCanvas } from "./components/GameCanvas";
import { GameHUD } from "./components/GameHUD";
import { GameOver } from "./components/GameOver";
import { MainMenu } from "./components/MainMenu";
import { Notifications } from "./components/Notifications";
import { PauseMenu } from "./components/PauseMenu";
import { TouchControls, hasCoarsePointer } from "./components/TouchControls";
import { useGameStore } from "./store/gameStore";

export default function App() {
  const status = useGameStore((s) => s.status);
  const [touch, setTouch] = useState(hasCoarsePointer);

  // Reveal the on-screen controls the first time a real touch happens, which
  // covers hybrid laptops that report a fine pointer by default.
  useEffect(() => {
    if (touch) return;
    const onTouch = () => setTouch(true);
    window.addEventListener("touchstart", onTouch, { once: true, passive: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, [touch]);

  const inSession = status === "playing" || status === "paused" || status === "countdown";

  return (
    <div className={`app app--${status}`}>
      <GameCanvas />

      <div className="vignette" aria-hidden="true" />

      {inSession && <GameHUD />}
      {status === "countdown" && <Countdown />}
      {status === "menu" && <MainMenu />}
      {status === "paused" && <PauseMenu />}
      {status === "gameover" && <GameOver />}

      <Notifications />

      {touch && status === "playing" && <TouchControls />}
    </div>
  );
}
