// 이 도메인의 이전 주인이 올렸던 일본어 쇼핑몰 스팸(/shop/items/...)이 아직 구글 색인에
// 남아 있다. 404보다 410(영구 삭제)을 줘야 구글이 더 빨리 색인에서 뺀다.
export function onRequest() {
  return new Response('Gone', {
    status: 410,
    headers: { 'Content-Type': 'text/plain', 'X-Robots-Tag': 'noindex' }
  });
}
