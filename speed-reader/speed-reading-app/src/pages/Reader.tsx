import { useState } from "react";
import PDFViewer from "../components/PDFViewer";
import SpeedControls from "../components/SpeedControls";

const Reader = () => {
  const [file, setFile] = useState<string>("");
  const [speed, setSpeed] = useState<number>(1);  // Adding speed state
  const [wordsPerFrame, setWordsPerFrame] = useState<number>(5);  // Adding wordsPerFrame state

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(URL.createObjectURL(uploadedFile));
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Reading Mode</h2>
      <input type="file" accept="application/pdf" onChange={handleFileUpload} />
      {file && <PDFViewer file={file} />}
      <SpeedControls 
        speed={speed} 
        setSpeed={setSpeed} 
        wordsPerFrame={wordsPerFrame} 
        setWordsPerFrame={setWordsPerFrame} 
      />
    </div>
  );
};

export default Reader;
