// Runs in the Android build (GitHub Actions) right after `tauri android init`.
// Replaces the generated MainActivity so the page never sits under the status
// bar or the navigation bar: the WebView is padded by the system bar sizes and
// the bars get the app's colour with light icons.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "src-tauri", "gen", "android");
function find(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "build" || e.name === ".gradle") continue;
      const hit = find(p, name);
      if (hit) return hit;
    } else if (e.name === name) return p;
  }
  return null;
}

const file = find(root, "MainActivity.kt");
if (!file) {
  console.error("MainActivity.kt not found under", root);
  process.exit(1);
}
const pkg = /^package\s+([\w.]+)/m.exec(fs.readFileSync(file, "utf8"))[1];

fs.writeFileSync(
  file,
  `package ${pkg}

import android.graphics.Color
import android.os.Bundle
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val bg = Color.parseColor("#141724")
    window.decorView.setBackgroundColor(bg)
    val content = findViewById<android.view.View>(android.R.id.content)
    // Keep the page clear of the status bar, the navigation bar and camera cut-outs.
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
  }
}
`
);
console.log("Patched", file, "(package " + pkg + ")");
