import { Button } from '@repo/ui/components/ui/button';
import { ArrowRight, Camera, CameraOff, Clipboard, QrCode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useWallet } from '../../lib/wallet-store';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

type ScanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddressScanned?: (address: string) => void;
};

export const ScanDialog = ({ open, onOpenChange, onAddressScanned }: ScanDialogProps) => {
  const { selectedToken } = useWallet();
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError('Unable to access camera. Please check permissions.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setManualAddress(text);
    } catch {
      // Clipboard access denied.
    }
  };

  const handleSubmitAddress = () => {
    const value = manualAddress.trim();
    if (!value) {
      return;
    }

    onAddressScanned?.(value);
    setManualAddress('');
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      setManualAddress('');
      setCameraError('');
    }
  }, [open]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Scan QR Code
          </DialogTitle>
          <DialogDescription>Scan a QR code or enter an address manually</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="scan" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scan">Scan QR</TabsTrigger>
            <TabsTrigger value="manual">Enter Address</TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="space-y-4">
            <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-lg border">
              {cameraActive ? (
                <>
                  <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="border-primary h-48 w-48 rounded-lg border-2" />
                  </div>
                  <div className="from-background/80 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-4">
                    <p className="text-muted-foreground text-center text-sm">Position QR code within the frame</p>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
                  {cameraError ? (
                    <>
                      <CameraOff className="text-muted-foreground h-12 w-12" />
                      <p className="text-muted-foreground text-center text-sm">{cameraError}</p>
                    </>
                  ) : (
                    <>
                      <Camera className="text-muted-foreground h-12 w-12" />
                      <p className="text-muted-foreground text-center text-sm">Click below to start scanning</p>
                    </>
                  )}
                </div>
              )}
            </div>

            <Button
              className="w-full"
              variant={cameraActive ? 'outline' : 'default'}
              onClick={() => void (cameraActive ? stopCamera() : startCamera())}
            >
              {cameraActive ? (
                <>
                  <CameraOff className="mr-2 h-4 w-4" />
                  Stop Camera
                </>
              ) : (
                <>
                  <Camera className="mr-2 h-4 w-4" />
                  Start Camera
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">Recipient Address</Label>
              <div className="flex gap-2">
                <Input
                  id="address"
                  placeholder={`Enter ${selectedToken.symbol} address`}
                  value={manualAddress}
                  onChange={(event) => setManualAddress(event.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void handlePasteFromClipboard()}
                  title="Paste from clipboard"
                >
                  <Clipboard className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button className="w-full" onClick={handleSubmitAddress} disabled={!manualAddress.trim()}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
