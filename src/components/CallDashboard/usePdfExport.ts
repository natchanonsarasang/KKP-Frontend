import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { format } from "date-fns";

// Renders the hidden off-screen report layout (see PdfExportLayout) to a
// multi-page PDF, splitting page breaks on section boundaries so a chart is
// never cut through the middle.
export function usePdfExport() {
  const exportRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    setIsExportingPdf(true);
    try {
      // Allow charts to layout
      await new Promise((r) => setTimeout(r, 400));
      const container = exportRef.current;
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: container.scrollWidth,
        windowHeight: container.scrollHeight,
        width: container.scrollWidth,
        height: container.scrollHeight,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // px-per-mm ratio of the rendered canvas
      const pxPerMm = canvas.width / pageW;
      const pageHeightPx = Math.floor(pageH * pxPerMm);

      // Collect section boundaries (in canvas pixels) so we can avoid
      // breaking pages through the middle of a card/chart.
      const containerRect = container.getBoundingClientRect();
      const domToCanvas = canvas.height / container.scrollHeight;
      const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-section]")).map((el) => {
        const r = el.getBoundingClientRect();
        const top = Math.floor((r.top - containerRect.top) * domToCanvas);
        const bottom = Math.ceil((r.bottom - containerRect.top) * domToCanvas);
        return { top, bottom };
      });

      const totalH = canvas.height;
      let pageStart = 0;
      let safetyPages = 0;
      while (pageStart < totalH && safetyPages < 50) {
        safetyPages += 1;
        let pageEnd = Math.min(pageStart + pageHeightPx, totalH);

        if (pageEnd < totalH) {
          // Find a section that straddles the proposed page break and snap
          // the break to that section's top (i.e. the whitespace above it).
          const straddling = sections
            .filter((s) => s.top > pageStart + 50 && s.top < pageEnd && s.bottom > pageEnd)
            .sort((a, b) => a.top - b.top)[0];
          if (straddling) {
            pageEnd = straddling.top;
          }
        }

        const sliceHeight = pageEnd - pageStart;
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const ctx = pageCanvas.getContext("2d");
        if (!ctx) break;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, pageStart, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        const imgData = pageCanvas.toDataURL("image/png");
        const renderedH = sliceHeight / pxPerMm;

        if (pageStart > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, pageW, renderedH);

        pageStart = pageEnd;
      }

      const stamp = format(new Date(), "yyyy-MM-dd");
      pdf.save(`analytics-${stamp}.pdf`);
      toast.success("ส่งออก PDF เรียบร้อย");
    } catch (err) {
      console.error("PDF export failed", err);
      toast.error("ส่งออก PDF ไม่สำเร็จ");
    } finally {
      setIsExportingPdf(false);
    }
  };

  return { exportRef, isExportingPdf, handleExportPdf };
}
