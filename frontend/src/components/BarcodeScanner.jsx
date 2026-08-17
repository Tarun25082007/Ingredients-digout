import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';

const BarcodeScanner = ({ onResult, onError, onClose }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    
    Html5Qrcode.getCameras().then(devices => {
      if (!isMounted) return;

      if (devices && devices.length) {
        setCameras(devices);
        // default to the last camera (often the back camera on mobile)
        const defaultCam = devices.length > 1 ? devices[devices.length - 1].id : devices[0].id;
        setActiveCameraId(defaultCam);
        
        scannerRef.current = new Html5Qrcode("barcode-reader-element");
        setIsScanning(true);
        
        scannerRef.current.start(
          defaultCam, 
          {
            fps: 10,
            qrbox: { width: 250, height: 150 }
          },
          (decodedText, decodedResult) => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => {
                    if (isMounted) setIsScanning(false);
                    onResult(decodedText);
                }).catch(err => {
                    console.error("Failed to stop scanner.", err);
                    onResult(decodedText);
                });
            }
          },
          (errorMessage) => {
            // Ignore scan failure, it happens constantly while searching for barcode
          }
        ).then(() => {
          // Check if unmounted while camera was starting
          if (!isMounted && scannerRef.current && scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(console.error);
          }
        }).catch(err => {
          if (isMounted) {
            setIsScanning(false);
            onError("Failed to start camera for barcode scanning.");
          }
        });
      } else {
        if (isMounted) onError("No cameras found on your device.");
      }
    }).catch(err => {
      if (isMounted) onError("Error getting cameras: " + err);
    });

    return () => {
      isMounted = false;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(err => console.error("Failed to stop scanner on unmount.", err));
      }
    };
  }, [onResult, onError]);

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-sm mx-auto relative rounded-xl overflow-hidden shadow-inner bg-black">
        <div id="barcode-reader-element" className="w-full h-64 bg-black"></div>
        {isScanning && (
          <div className="absolute inset-0 border-2 border-emerald-500 rounded-xl pointer-events-none">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></div>
          </div>
        )}
      </div>
      <p className="mt-4 text-sm text-gray-500 text-center">Point your camera at a product barcode to scan it automatically.</p>
      
      <div className="mt-6 flex justify-center w-full">
        <button 
          onClick={onClose}
          className="px-8 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default BarcodeScanner;
