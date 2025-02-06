import React from "react";

interface SpeedControlsProps {
  speed: number;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  wordsPerFrame: number;
  setWordsPerFrame: React.Dispatch<React.SetStateAction<number>>;
}

const SpeedControls: React.FC<SpeedControlsProps> = ({ speed, setSpeed, wordsPerFrame, setWordsPerFrame }) => {
  return (
    <div className="mt-4">
      <div className="flex justify-between mb-4">
        <div>
          <label className="text-lg">Speed: {speed}</label>
          <input
            type="range"
            min="1"
            max="10"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-lg">Words per Frame: {wordsPerFrame}</label>
          <input
            type="range"
            min="1"
            max="10"
            value={wordsPerFrame}
            onChange={(e) => setWordsPerFrame(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default SpeedControls;
