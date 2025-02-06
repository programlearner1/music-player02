import { Worker, Viewer } from "@react-pdf-viewer/core";
import { useSpeed } from "../context/speedcontext";

// Define types for the props
interface PDFViewerProps {
  file: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ file }) => {
  const { speed, wordsPerFrame } = useSpeed();

  // You can apply speed and wordsPerFrame here if needed
  // For now, we'll just display them for example purposes
  console.log("Speed:", speed);
  console.log("Words per Frame:", wordsPerFrame);

  return (
    <div className="w-full h-[500px] border">
      <Worker workerUrl={`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`}>
        <Viewer fileUrl={file} />
      </Worker>
    </div>
  );
};

export default PDFViewer;
