# lz4js-pure

 - 📦 No dependencies - only 3.7kb
 - 💍 Pure JS
 - 🌳 Plug n play with kafkajs
 - 🚀 Tuned for performance
 - 💨 Much faster than kafka-lz4-lite

Optimal for json data, txt or small files. While this package is made with special attention to performance its recommended to use a performant C/Rust package if you are mainly doing large files.

### General use
```js
import { compress, decompress } from 'lz4js-pure';

const payload = Buffer.from(`It's a dangerous business, Frodo, going out your door. You step onto the road, and .....`);
const payload_lz4 = compress(payload);
const payload_dcomp = decompress(payload_lz4);
```

### Use with kafkajs
```js
import { CompressionTypes, CompressionCodecs } from "kafkajs";
import { codec } from 'lz4js-pure';

CompressionCodecs[CompressionTypes.LZ4] = codec;
```

### Roadmap

  - Keep up to date with nodejs releases and possible improvements
  - Improve and document error handling
  - Tests
  - Benchmarks

#### Acknowledgement
Based on work by [John Chadwick](https://github.com/johnwchadwick) and [Alexander Vukov](https://github.com/alex-vukov)