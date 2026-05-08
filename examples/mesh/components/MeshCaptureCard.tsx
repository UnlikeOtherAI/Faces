import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type MeshCapture = {
  id: number;
  name: string;
  direction: string;
  src: string;
  index: number;
  total: number;
};

export type MeshCompletePayload = {
  captures: Array<Pick<MeshCapture, 'id' | 'name' | 'direction' | 'src'>>;
};

type Props = {
  meshHtml: string;
  onCapture?: (capture: MeshCapture) => void;
  onComplete?: (payload: MeshCompletePayload) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  onLog?: (data: unknown) => void;
};

const errorBridge = `
  (function(){
    window.addEventListener('error', function(e){
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error', message: e.message, source: e.filename, line: e.lineno
        }));
      } catch(_){}
    });
    window.addEventListener('unhandledrejection', function(e){
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error', message: 'unhandledrejection: ' + (e.reason && e.reason.message || e.reason)
        }));
      } catch(_){}
    });
    var orig = console.log;
    console.log = function(){
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', args: Array.from(arguments).map(String) })); } catch(_){}
      return orig.apply(console, arguments);
    };
    true;
  })();
`;

export function MeshCaptureCard({ meshHtml, onCapture, onComplete, onReady, onError, onLog }: Props) {
  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    let data: any;
    try { data = JSON.parse(e.nativeEvent.data); } catch { return; }
    switch (data?.type) {
      case 'capture': onCapture?.(data); break;
      case 'complete': onComplete?.(data); break;
      case 'ready': onReady?.(); break;
      case 'error': onError?.(String(data.message ?? 'unknown error')); break;
      case 'log': onLog?.(data.args); break;
    }
  }, [onCapture, onComplete, onReady, onError, onLog]);

  return (
    <View style={styles.root}>
      <WebView
        style={styles.web}
        source={{ html: meshHtml, baseUrl: 'https://faces.local/' }}
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        javaScriptEnabled
        domStorageEnabled
        bounces={false}
        injectedJavaScriptBeforeContentLoaded={errorBridge}
        onMessage={handleMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f8fa' },
  web: { flex: 1, backgroundColor: '#f7f8fa' },
});
