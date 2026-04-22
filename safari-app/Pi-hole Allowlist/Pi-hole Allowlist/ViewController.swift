//
//  ViewController.swift
//  Pi-hole Allowlist
//
//  Created by Erwin van de Pol on 10/04/2026.
//

import Cocoa
import SafariServices
import WebKit

let extensionBundleIdentifier = "nl.polleke.Pi-hole-Allowlist.Extension"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            if let error = error {
                let ns = error as NSError
                // SFErrorDomain 1 = noExtensionFound: Safari has not registered the extension yet
                // (unsigned dev build, first launch, or Safari not opened). Not a hard failure.
                if ns.domain == "SFErrorDomain" && ns.code == 1 {
                    DispatchQueue.main.async {
                        if #available(macOS 13, *) {
                            webView.evaluateJavaScript("show(null, true)", completionHandler: nil)
                        } else {
                            webView.evaluateJavaScript("show(null, false)", completionHandler: nil)
                        }
                    }
                    return
                }
                let escaped = self.javaScriptString(from: self.userFacingExtensionError(error))
                DispatchQueue.main.async {
                    webView.evaluateJavaScript("showQueryError(\"\(escaped)\")", completionHandler: nil)
                }
                return
            }
            guard let state = state else {
                DispatchQueue.main.async {
                    if #available(macOS 13, *) {
                        webView.evaluateJavaScript("show(null, true)", completionHandler: nil)
                    } else {
                        webView.evaluateJavaScript("show(null, false)", completionHandler: nil)
                    }
                }
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show(\(state.isEnabled), true)", completionHandler: nil)
                } else {
                    webView.evaluateJavaScript("show(\(state.isEnabled), false)", completionHandler: nil)
                }
            }
        }
    }

    private func userFacingExtensionError(_ error: Error) -> String {
        let ns = error as NSError
        if ns.domain == "SFErrorDomain" && ns.code == 1 {
            return "Safari has not registered the extension yet. Use Settings → Developer → Allow unsigned extensions if needed, then enable the extension under Settings → Extensions."
        }
        return String(describing: error)
    }

    private func javaScriptString(from s: String) -> String {
        s
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\r", with: " ")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if (message.body as! String != "open-preferences") {
            return;
        }

        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
        }
    }

}
