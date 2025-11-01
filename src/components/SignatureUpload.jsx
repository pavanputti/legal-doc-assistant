import { useState, useRef } from 'react';

const SignatureUpload = ({ onSignatureUpload, placeholder }) => {
  const [signatureMethod, setSignatureMethod] = useState('text'); // 'text', 'draw', 'upload'
  const [textSignature, setTextSignature] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  const handleMethodChange = (method) => {
    setSignatureMethod(method);
    if (method === 'upload') {
      fileInputRef.current?.click();
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target.result;
      setUploadedImage(imageData);
      setImagePreview(imageData);
      onSignatureUpload(imageData);
    };
    reader.readAsDataURL(file);
  };

  const handleTextSubmit = () => {
    if (textSignature.trim()) {
      onSignatureUpload(textSignature.trim());
    }
  };

  const handleDrawSignature = () => {
    // Simple canvas drawing - can be enhanced later
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    
    // Draw a simple line signature (placeholder)
    ctx.beginPath();
    ctx.moveTo(50, canvas.height / 2);
    ctx.lineTo(canvas.width - 50, canvas.height / 2);
    ctx.stroke();
    
    // Convert to image
    const imageData = canvas.toDataURL('image/png');
    setImagePreview(imageData);
    onSignatureUpload(imageData);
  };

  return (
    <div className="signature-upload">
      <div className="signature-methods">
        <button
          type="button"
          className={`signature-method-btn ${signatureMethod === 'text' ? 'active' : ''}`}
          onClick={() => setSignatureMethod('text')}
        >
          ✍️ Type Name
        </button>
        <button
          type="button"
          className={`signature-method-btn ${signatureMethod === 'draw' ? 'active' : ''}`}
          onClick={() => setSignatureMethod('draw')}
        >
          🖊️ Draw
        </button>
        <button
          type="button"
          className={`signature-method-btn ${signatureMethod === 'upload' ? 'active' : ''}`}
          onClick={() => handleMethodChange('upload')}
        >
          📷 Upload Image
        </button>
      </div>

      <input
        id="signature-image-upload-input"
        name="signature-image-upload"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        style={{ display: 'none' }}
      />

      {signatureMethod === 'text' && (
        <div className="signature-text-input">
          <input
            id="signature-text-input"
            name="signature-text"
            type="text"
            value={textSignature}
            onChange={(e) => setTextSignature(e.target.value)}
            placeholder="Enter name for signature line"
            className="signature-text-field"
            autoFocus
          />
          <button
            type="button"
            onClick={handleTextSubmit}
            className="signature-submit-btn"
            disabled={!textSignature.trim()}
          >
            Submit
          </button>
        </div>
      )}

      {signatureMethod === 'draw' && (
        <div className="signature-draw">
          <canvas
            ref={canvasRef}
            width={400}
            height={150}
            style={{
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'crosshair',
              backgroundColor: '#fff'
            }}
            onMouseDown={(e) => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const ctx = canvas.getContext('2d');
              const rect = canvas.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              
              ctx.beginPath();
              ctx.moveTo(x, y);
              
              const onMouseMove = (moveEvent) => {
                const moveX = moveEvent.clientX - rect.left;
                const moveY = moveEvent.clientY - rect.top;
                ctx.lineTo(moveX, moveY);
                ctx.stroke();
              };
              
              const onMouseUp = () => {
                canvas.removeEventListener('mousemove', onMouseMove);
                canvas.removeEventListener('mouseup', onMouseUp);
              };
              
              canvas.addEventListener('mousemove', onMouseMove);
              canvas.addEventListener('mouseup', onMouseUp);
            }}
          />
          <button
            type="button"
            onClick={handleDrawSignature}
            className="signature-submit-btn"
            style={{ marginTop: '0.5rem' }}
          >
            Use This Signature
          </button>
        </div>
      )}

      {signatureMethod === 'upload' && imagePreview && (
        <div className="signature-preview">
          <img
            src={imagePreview}
            alt="Signature preview"
            style={{
              maxWidth: '300px',
              maxHeight: '100px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SignatureUpload;

