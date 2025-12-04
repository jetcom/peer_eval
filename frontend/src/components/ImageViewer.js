import React, { useState, useEffect, useCallback } from 'react';

/**
 * Lightbox-style image viewer with navigation
 *
 * Props:
 * - images: Array of { id, url, fileName } objects
 * - initialIndex: Starting image index
 * - onClose: Callback when viewer is closed
 */
const ImageViewer = ({ images, initialIndex = 0, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when viewer is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, goNext, goPrev]);

  if (!currentImage) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      {/* Close button */}
      <button
        style={styles.closeButton}
        onClick={onClose}
        title="Close (Esc)"
      >
        ×
      </button>

      {/* Counter */}
      {hasMultiple && (
        <div style={styles.counter}>
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Previous button */}
      {hasMultiple && (
        <button
          style={{ ...styles.navButton, left: '10px' }}
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          title="Previous (←)"
        >
          ‹
        </button>
      )}

      {/* Image container */}
      <div style={styles.imageContainer} onClick={(e) => e.stopPropagation()}>
        <img
          src={currentImage.url}
          alt={currentImage.fileName}
          style={styles.image}
        />
        <div style={styles.fileName}>{currentImage.fileName}</div>
      </div>

      {/* Next button */}
      {hasMultiple && (
        <button
          style={{ ...styles.navButton, right: '10px' }}
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          title="Next (→)"
        >
          ›
        </button>
      )}

      {/* Thumbnail strip for multiple images */}
      {hasMultiple && (
        <div style={styles.thumbnailStrip}>
          {images.map((img, idx) => (
            <button
              key={img.id}
              style={{
                ...styles.thumbnail,
                ...(idx === currentIndex ? styles.thumbnailActive : {})
              }}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
            >
              <img
                src={img.url}
                alt={img.fileName}
                style={styles.thumbnailImage}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  closeButton: {
    position: 'absolute',
    top: '15px',
    right: '20px',
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '40px',
    cursor: 'pointer',
    padding: '0 10px',
    lineHeight: 1,
    opacity: 0.8,
    transition: 'opacity 0.2s',
    zIndex: 10001,
  },
  counter: {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: 'white',
    fontSize: '16px',
    opacity: 0.8,
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: 'white',
    fontSize: '60px',
    cursor: 'pointer',
    padding: '20px 15px',
    lineHeight: 1,
    opacity: 0.7,
    transition: 'opacity 0.2s, background 0.2s',
    borderRadius: '4px',
    zIndex: 10001,
  },
  imageContainer: {
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'default',
  },
  image: {
    maxWidth: '100%',
    maxHeight: 'calc(80vh - 30px)',
    objectFit: 'contain',
    borderRadius: '4px',
  },
  fileName: {
    color: 'white',
    marginTop: '10px',
    fontSize: '14px',
    opacity: 0.7,
    textAlign: 'center',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  thumbnailStrip: {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '8px',
    padding: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: '8px',
    maxWidth: '90vw',
    overflowX: 'auto',
  },
  thumbnail: {
    width: '60px',
    height: '60px',
    padding: 0,
    border: '2px solid transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    overflow: 'hidden',
    flexShrink: 0,
    background: 'none',
  },
  thumbnailActive: {
    borderColor: 'white',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
};

export default ImageViewer;
