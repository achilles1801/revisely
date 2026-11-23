package app.revisely.reciteengine;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.spec.MGF1ParameterSpec;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import javax.crypto.spec.SecretKeySpec;

/**
 * Reads one sealed part of Recite's pack ({@code .rcpk}; the format is functions/src/recitePack/format.ts). Every
 * chunk's tag, the header and each blob's sha256 are checked. With an allocator the blobs land in its buffers; without
 * one they are checked and dropped, so a check never holds the pack in memory. Plain Java, so it runs on a desktop JDK
 * against the same vectors as the iOS reader (scripts/recite-pack-check).
 */
public final class RecitePackReader {
  private RecitePackReader() {}

  /** A direct buffer of {@code room} bytes for a blob. The weights' must be 64-byte aligned (recite_core.h). */
  public interface Allocator {
    ByteBuffer allocate(String name, int room);
  }

  public static final class Failure extends Exception {
    Failure(String message) {
      super(message);
    }
  }

  /** A blob in memory, as rc_blob takes it: {@code room} is its size there. */
  public static final class Blob {
    public final String name;
    public final ByteBuffer data;
    public final int size;
    public final int room;

    Blob(String name, ByteBuffer data, int size, int room) {
      this.name = name;
      this.data = data;
      this.size = size;
      this.room = room;
    }

    /** Zeroes it, once the engine has let go of it (rc_release). */
    public void wipe() {
      ByteBuffer d = data.duplicate();
      d.clear();
      while (d.remaining() >= 8) d.putLong(0L);
      while (d.hasRemaining()) d.put((byte) 0);
    }
  }

  private static final int TAG = 16;
  private static final int INFLATE = 1 << 18;

  private static final class Row {
    String name;
    int codec;
    long offset, stored, size, room;
    byte[] sha256;
  }

  private static final class Fields {
    final ByteBuffer b;

    Fields(byte[] bytes, int length) {
      b = ByteBuffer.wrap(bytes, 0, length).order(ByteOrder.LITTLE_ENDIAN);
    }

    private void need(int n) throws Failure {
      if (n < 0 || b.remaining() < n) throw new Failure("cut short");
    }

    byte[] take(int n) throws Failure {
      need(n);
      byte[] out = new byte[n];
      b.get(out);
      return out;
    }

    int u8() throws Failure {
      need(1);
      return b.get() & 0xff;
    }

    int u16() throws Failure {
      need(2);
      return b.getShort() & 0xffff;
    }

    long u32() throws Failure {
      need(4);
      return b.getInt() & 0xffffffffL;
    }

    long u64() throws Failure {
      need(8);
      long v = b.getLong();
      if (v < 0) throw new Failure("size out of range");
      return v;
    }

    String str() throws Failure {
      return new String(take(u16()), StandardCharsets.UTF_8);
    }
  }

  /** One blob being read: its hash, its buffer, and an inflater when it is deflated. */
  private static final class Sink {
    final Row row;
    final Blob blob;
    final MessageDigest hash;
    final Inflater inflater;
    final byte[] out;
    long written;

    Sink(Row row, Allocator alloc) throws Failure, GeneralSecurityException {
      this.row = row;
      if (row.size > Integer.MAX_VALUE || row.room > Integer.MAX_VALUE || row.room < row.size) {
        throw new Failure(row.name + ": sizes");
      }
      if (row.codec == 0) {
        if (row.stored != row.size) throw new Failure(row.name + ": stored and read sizes differ");
        inflater = null;
        out = null;
      } else if (row.codec == 1) {
        inflater = new Inflater(true);
        out = new byte[INFLATE];
      } else {
        throw new Failure(row.name + ": unknown codec " + row.codec);
      }
      hash = MessageDigest.getInstance("SHA-256");
      if (alloc == null) {
        blob = null;
      } else {
        ByteBuffer data = alloc.allocate(row.name, (int) row.room);
        if (data == null || !data.isDirect() || data.capacity() < row.room) throw new Failure("no memory for " + row.name);
        blob = new Blob(row.name, data, (int) row.size, (int) row.room);
      }
    }

    private void put(byte[] b, int off, int n) throws Failure {
      if (n == 0) return;
      if (written + n > row.size) throw new Failure(row.name + " is longer than its size");
      hash.update(b, off, n);
      if (blob != null) {
        ByteBuffer d = blob.data.duplicate();
        d.position((int) written);
        d.put(b, off, n);
      }
      written += n;
    }

    void feed(byte[] b, int off, int n) throws Failure {
      if (inflater == null) {
        put(b, off, n);
        return;
      }
      if (n == 0) return;
      if (inflater.finished()) throw new Failure(row.name + ": data after its end");
      inflater.setInput(b, off, n);
      drain();
      if (inflater.finished() && inflater.getRemaining() > 0) throw new Failure(row.name + ": data after its end");
    }

    private void drain() throws Failure {
      try {
        while (!inflater.finished()) {
          int k = inflater.inflate(out);
          put(out, 0, k);
          if (k == 0) {
            if (inflater.needsDictionary()) throw new Failure(row.name + " doesn't inflate");
            if (inflater.needsInput()) return;
          }
        }
      } catch (DataFormatException e) {
        throw new Failure(row.name + " doesn't inflate");
      }
    }

    void finish() throws Failure {
      if (inflater != null) {
        // raw deflate may want one byte past its end (Inflater's `nowrap` contract)
        if (!inflater.finished()) {
          inflater.setInput(new byte[1]);
          drain();
        }
        boolean ended = inflater.finished();
        inflater.end();
        if (!ended) throw new Failure(row.name + " doesn't inflate");
      }
      if (written != row.size) throw new Failure(row.name + " isn't its size");
      if (!MessageDigest.isEqual(hash.digest(), row.sha256)) throw new Failure(row.name + " doesn't match its sha256");
    }

    void abandon() {
      if (inflater != null) inflater.end();
    }
  }

  /** The part in {@code file}, sealed with {@code key}, for this pack and part. Throws on anything that doesn't check. */
  public static List<Blob> read(File file, byte[] key, String packId, String part, Allocator alloc)
      throws IOException, Failure {
    List<Sink> sinks = new ArrayList<>();
    try (RandomAccessFile in = new RandomAccessFile(file, "r")) {
      long fileSize = in.length();
      byte[] start = new byte[(int) Math.min(fileSize, 4 + 4 + 2 + 255 + 2 + 255 + 4 + 8 + 8)];
      in.readFully(start);
      Fields h = new Fields(start, start.length);
      if (!Arrays.equals(h.take(4), "RCPK".getBytes(StandardCharsets.US_ASCII))) throw new Failure("not a pack part");
      if (h.u32() != 1) throw new Failure("pack format");
      if (!h.str().equals(packId)) throw new Failure("another pack");
      if (!h.str().equals(part)) throw new Failure("another part");
      long chunkL = h.u32();
      long plainSize = h.u64();
      byte[] prefix = h.take(8);
      if (chunkL < 1024 || chunkL > 64L << 20) throw new Failure("chunk size");
      int chunk = (int) chunkL;
      int headLength = h.b.position();
      byte[] head = Arrays.copyOf(start, headLength);
      long chunks = Math.max(1, (plainSize + chunk - 1) / chunk);
      if (fileSize != headLength + plainSize + chunks * TAG) throw new Failure("wrong length");
      in.seek(headLength);

      SecretKeySpec spec = new SecretKeySpec(key, "AES");
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      byte[] sealed = new byte[chunk + TAG];
      byte[] plain = new byte[chunk + TAG];
      int current = 0;
      long doneInBlob = 0;
      long bodyLeft = 0;
      try {
        for (long i = 0; i < chunks; i++) {
          int size = (int) Math.min(chunk, plainSize - i * chunk);
          in.readFully(sealed, 0, size + TAG);
          ByteBuffer index = ByteBuffer.allocate(4).putInt((int) i);
          byte[] nonce = Arrays.copyOf(prefix, 12);
          System.arraycopy(index.array(), 0, nonce, 8, 4);
          byte[] aad = Arrays.copyOf(head, headLength + 5);
          System.arraycopy(index.array(), 0, aad, headLength, 4);
          aad[headLength + 4] = (byte) (i == chunks - 1 ? 1 : 0);
          int got;
          try {
            cipher.init(Cipher.DECRYPT_MODE, spec, new GCMParameterSpec(TAG * 8, nonce));
            cipher.updateAAD(aad);
            got = cipher.doFinal(sealed, 0, size + TAG, plain, 0);
          } catch (GeneralSecurityException e) {
            throw new Failure("chunk " + i + " failed its check");
          }

          int at = 0;
          if (i == 0) {
            // the blobs' table, which is all in the first chunk
            Fields t = new Fields(plain, got);
            if (!Arrays.equals(t.take(4), "RCPC".getBytes(StandardCharsets.US_ASCII))) throw new Failure("not a container");
            if (t.u32() != 2) throw new Failure("container version");
            long n = t.u32();
            if (n > 256) throw new Failure("too many blobs");
            long next = 0;
            Set<String> names = new HashSet<>();
            for (long k = 0; k < n; k++) {
              Row r = new Row();
              r.name = t.str();
              r.codec = t.u8();
              r.offset = t.u64();
              r.stored = t.u64();
              r.size = t.u64();
              r.room = t.u64();
              r.sha256 = t.take(32);
              if (r.offset != next || !names.add(r.name)) throw new Failure("the blobs' table");
              next += r.stored;
              sinks.add(new Sink(r, alloc));
            }
            at = t.b.position();
            if (at + next != plainSize) throw new Failure("the blobs don't fill the part");
            bodyLeft = next;
          }
          int left = got - at;
          bodyLeft -= left;
          while (left > 0) {
            while (current < sinks.size() && sinks.get(current).row.stored == doneInBlob) {
              sinks.get(current).finish();
              current++;
              doneInBlob = 0;
            }
            if (current >= sinks.size()) throw new Failure("data past the last blob");
            Sink s = sinks.get(current);
            int k = (int) Math.min(left, s.row.stored - doneInBlob);
            s.feed(plain, at, k);
            at += k;
            left -= k;
            doneInBlob += k;
          }
        }
        if (bodyLeft != 0) throw new Failure("cut short");
        while (current < sinks.size()) {
          if (sinks.get(current).row.stored != doneInBlob) throw new Failure("cut short");
          sinks.get(current).finish();
          current++;
          doneInBlob = 0;
        }
      } finally {
        Arrays.fill(plain, (byte) 0);
      }
    } catch (GeneralSecurityException e) {
      throw new Failure("no AES-GCM or SHA-256 here: " + e.getMessage());
    } catch (Failure | IOException | RuntimeException e) {
      for (Sink s : sinks) {
        s.abandon();
        if (s.blob != null) s.blob.wipe();
      }
      throw e;
    }
    List<Blob> out = new ArrayList<>();
    if (alloc != null) for (Sink s : sinks) out.add(s.blob);
    return out;
  }

  /** The pack's key out of its wrapped form (RSA-OAEP, SHA-1 for OAEP and MGF1). */
  public static byte[] unwrap(PrivateKey key, byte[] wrapped) throws Failure {
    try {
      Cipher c = Cipher.getInstance("RSA/ECB/OAEPWithSHA-1AndMGF1Padding");
      c.init(Cipher.DECRYPT_MODE, key,
          new OAEPParameterSpec("SHA-1", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT));
      byte[] plain = c.doFinal(wrapped);
      if (plain.length != 32) throw new Failure("the pack's key isn't 32 bytes");
      return plain;
    } catch (GeneralSecurityException e) {
      throw new Failure("the pack's key doesn't open on this phone");
    }
  }
}
