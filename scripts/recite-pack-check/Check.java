import app.revisely.reciteengine.RecitePackReader;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

/** The Android pack reader against the vectors (vectors.js), on a desktop JDK. Built by run.sh. */
public class Check {
  static byte[] hex(String s) {
    byte[] out = new byte[s.length() / 2];
    for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
    return out;
  }

  public static void main(String[] args) throws Exception {
    File folder = new File(args[0]);
    byte[] key = null;
    int passed = 0, refused = 0, failed = 0;
    RecitePackReader.Allocator alloc = (name, room) -> ByteBuffer.allocateDirect(room);
    for (String line : Files.readAllLines(new File(folder, "vectors.txt").toPath())) {
      String[] f = line.split("\t", -1);
      switch (f[0]) {
        case "key":
          key = hex(f[1]);
          break;
        case "rsa": {
          PrivateKey priv = KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(f[2])));
          boolean same = Arrays.equals(RecitePackReader.unwrap(priv, Base64.getDecoder().decode(f[3])), key);
          System.out.println("unwrap (RSA-OAEP SHA-1): " + (same ? "ok" : "DIFFERS"));
          if (!same) failed++;
          break;
        }
        case "ok":
          try {
            File file = new File(folder, f[1]);
            RecitePackReader.read(file, key, f[2], f[3], null);
            long t0 = System.nanoTime();
            List<RecitePackReader.Blob> blobs = RecitePackReader.read(file, key, f[2], f[3], alloc);
            long ms = (System.nanoTime() - t0) / 1_000_000;
            boolean good = blobs.size() == f.length - 4;
            for (int i = 0; good && i < blobs.size(); i++) {
              String[] w = f[i + 4].split(":");
              RecitePackReader.Blob b = blobs.get(i);
              ByteBuffer d = b.data.duplicate();
              d.position(0).limit(b.size);
              MessageDigest sha = MessageDigest.getInstance("SHA-256");
              sha.update(d);
              good = b.name.equals(w[0]) && b.size == Integer.parseInt(w[1]) && b.room == Integer.parseInt(w[2])
                  && Arrays.equals(sha.digest(), hex(w[3]));
            }
            if (good) passed++;
            else {
              failed++;
              System.out.println("DIFFERS " + f[1]);
            }
            if (f[1].startsWith("real-")) System.out.println(f[1] + " opened in " + ms + " ms");
          } catch (Exception e) {
            failed++;
            System.out.println("FAILED " + f[1] + " " + e);
          }
          break;
        case "bad":
          for (RecitePackReader.Allocator a : new RecitePackReader.Allocator[] {null, alloc}) {
            try {
              RecitePackReader.read(new File(folder, f[1]), key, f[2], f[3], a);
              failed++;
              System.out.println("NOT REFUSED " + f[1] + " " + f[4]);
            } catch (RecitePackReader.Failure e) {
              refused++;
            }
          }
          break;
        default:
      }
    }
    System.out.println("java: " + passed + " read, " + refused + " refused, " + failed + " wrong");
    System.exit(failed == 0 ? 0 : 1);
  }
}
