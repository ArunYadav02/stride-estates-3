import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { Skeleton, useToast } from '../../design-system';
import { IconUpload, IconTrash } from '../../layout/icons';
import styles from './PhotoManager.module.css';

/**
 * Photographs for one property. Drag on, click to remove, first one is the
 * primary. These are also the images the listing studio sends to the vision
 * model, which is why the order matters.
 */
export default function PhotoManager({ propertyId }) {
  const toast = useToast();
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const { loading, data, reload } = useAsync(() => api.media(propertyId), [propertyId]);

  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const { media } = await api.uploadMedia(propertyId, files);
      toast({ tone: 'success', title: `${media.length} photograph${media.length > 1 ? 's' : ''} added` });
      reload();
    } catch (error) {
      toast({ tone: 'danger', title: 'Upload failed', body: error.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteMedia(id);
      reload();
    } catch (error) {
      toast({ tone: 'danger', title: 'Could not remove that photograph' });
    }
  };

  if (loading) return <Skeleton height={120} radius="var(--radius-sm)" />;

  const media = data?.media || [];

  return (
    <div className={styles.grid}>
      {media.map((photo, index) => (
        <figure className={styles.tile} key={photo.id}>
          <img src={photo.url} alt={photo.caption || 'Property photograph'} loading="lazy" />
          {index === 0 && <figcaption className={styles.primary}>primary</figcaption>}
          <button className={styles.remove} onClick={() => remove(photo.id)} aria-label="Remove photograph">
            <IconTrash width={13} height={13} />
          </button>
        </figure>
      ))}

      <button
        type="button"
        className={`${styles.drop} ${dragging ? styles.dragging : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
      >
        <IconUpload width={18} height={18} />
        {busy ? 'Uploading…' : 'Drop photos or click'}
      </button>

      <input
        ref={input}
        type="file"
        className={styles.hidden}
        accept="image/*"
        multiple
        onChange={(e) => upload(e.target.files)}
      />
    </div>
  );
}
