import { useEffect, useRef } from "react";
import { getDocument } from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.entry";

interface PDFViewerProps {
  file: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ file }) => {
  const windowRef = useRef<Window | null>(null); // To track if the window has been opened
  const hasOpenedWindow = useRef(false); // Flag to track if the window has already opened

  useEffect(() => {
    if (hasOpenedWindow.current) return; // If the window has already been opened, do not open it again

    const extractText = async () => {
      const loadingTask = getDocument(file);
      const pdf = await loadingTask.promise;
      let extractedText = "";

      // Extract text from each page of the PDF
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        extractedText += textContent.items.map((item: any) => item.str).join(" ") + "\n\n";
      }

      // Open new window only once
      const newWindow = window.open("", "_blank");
      if (newWindow) {
        windowRef.current = newWindow; // Store window reference
        newWindow.document.write(`
          <html>
          <head>
            <title>PDF Content</title>
            <style>
              body {
                background-color: white;
                color: rgb(201,197,197);
                font-size: 18px;
                line-height: 1.6;
                padding: 20px;
                white-space: pre-wrap;
              }
            </style>
          </head>
          <body>${extractedText}</body>
          </html>
        `);
        newWindow.document.close();

        hasOpenedWindow.current = true; // Mark window as opened
      }
    };

    extractText();
  }, [file]); // Only run when the file prop changes

  return null; // No UI in the current window, as the content is being displayed in the new window
};

export default PDFViewer;
