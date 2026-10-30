export const URL_VECTORS: [string, boolean][] = [
  ["https://meet.google.com/abc-defg-hij", true], ["https://us02web.zoom.us/j/123456?pwd=x", true], ["https://zoom.us/j/1", true],
  ["https://teams.microsoft.com/l/meetup-join/x", true], ["https://meet.jit.si/rutinia-abc", true], ["https://acme.whereby.com/room", true],
  ["http://meet.google.com/abc", false], ["https://evilzoom.us/j/1", false], ["https://zoom.us.evil.com/j/1", false],
  ["https://meet.google.com@evil.com/x", false], ["https://user:pw@zoom.us/j/1", false], ["https://zoom.us:8443/j/1", false],
  ["javascript:alert(1)", false], ["https://evil.com/?u=https://zoom.us/j/1", false], ["https://zoom.us/j/1 x", false],
  ["https://example.com", false], ["", false], ["ftp://zoom.us/x", false], ["https://zoom.us\\@evil.com/", false],
];

