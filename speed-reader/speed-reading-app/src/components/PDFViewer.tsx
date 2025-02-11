import React, { useState, useEffect } from "react";
import { getDocument } from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.entry";

interface PDFViewerProps {
  file: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ file }) => {
  const [speed, setSpeed] = useState<number>(500); // Speed in milliseconds
  const [numWords, setNumWords] = useState<number>(3); // Words per highlight
  const [words, setWords] = useState<string[]>([]); // Extracted words
  const [currentIndex, setCurrentIndex] = useState<number>(0); // Current reading position

  useEffect(() => {
    if (!file) return;

    const extractText = async () => {
      try {
        const loadingTask = getDocument(file);
        const pdf = await loadingTask.promise;
        let extractedText = "";

        // Extract text from each page of the PDF
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          extractedText += textContent.items.map((item: any) => item.str).join(" ") + " ";
        }

        setWords(extractedText.trim().split(/\s+/)); // Store words and remove extra spaces
      } catch (error) {
        console.error("Error extracting text from PDF:", error);
      }
    };

    extractText();
  }, [file]);

  // Auto Highlighting Effect
  useEffect(() => {
    if (words.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) =>
        prevIndex + numWords >= words.length ? 0 : prevIndex + numWords
      );
    }, speed);

    return () => clearInterval(interval);
  }, [words, speed, numWords]);

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        padding: "20px",
        backgroundColor: "white",
        color: "rgb(201,197,197)",
      }}
    >
      {/* Speed & Number of Words Dropdowns */}
      <div style={{ position: "absolute", top: "10px", left: "20px", zIndex: 10 }}>
        <label style={{ marginRight: "10px" }}>Speed:</label>
        <select onChange={(e) => setSpeed(Number(e.target.value))} value={speed}>
          <option value={700}>Slow</option>
          <option value={500}>Normal</option>
          <option value={300}>Fast</option>
        </select>

        <label style={{ marginLeft: "20px", marginRight: "10px" }}>Words:</label>
        <select onChange={(e) => setNumWords(Number(e.target.value))} value={numWords}>
          <option value={3}>3 Words</option>
          <option value={5}>5 Words</option>
          <option value={7}>7 Words</option>
        </select>
      </div>

      {/* Text Display with Highlighting */}
      <div style={{ width: "100%", height: "100%", overflow: "auto", marginTop: "40px" }}>
        <p
          style={{
            fontSize: "18px",
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {words.map((word, index) => (
            <span
              key={index}
              style={{
                color: index >= currentIndex && index < currentIndex + numWords ? "black" : "rgb(201,197,197)",
                transition: "color 0.3s ease-in-out",
                marginRight: "5px",
              }}
            >
              {word}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
};

export default PDFViewer;
