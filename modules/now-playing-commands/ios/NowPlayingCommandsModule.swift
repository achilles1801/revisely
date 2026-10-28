import ExpoModulesCore
import MediaPlayer

// Previous and next on the lock screen and in Control Center, for the
// recitation: expo-audio's Now Playing has play/pause and the scrubber but no
// track commands, so this adds them beside it (its own commands are left alone)
// and tells JavaScript, which steps a verse back or on (lib/recitation).

public class NowPlayingCommandsModule: Module {
  private var registered = false

  public func definition() -> ModuleDefinition {
    Name("NowPlayingCommands")

    Events("onRemoteCommand")

    Function("setEnabled") { (enabled: Bool) in
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        let center = MPRemoteCommandCenter.shared()
        if !self.registered {
          self.registered = true
          center.nextTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("onRemoteCommand", ["command": "next"])
            return .success
          }
          center.previousTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("onRemoteCommand", ["command": "previous"])
            return .success
          }
        }
        center.nextTrackCommand.isEnabled = enabled
        center.previousTrackCommand.isEnabled = enabled
      }
    }
  }
}
