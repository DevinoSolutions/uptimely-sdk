import type { HttpCore } from "../core/http";

export abstract class ApiResource {
  constructor(protected readonly _core: HttpCore) {}
}
