class OtpHandler {
  constructor({
    page,
    executionId,
    pendingSignals,
    executionsRepo,
    log,
    timeoutMs = 5 * 60 * 1000,
  }) {
    this.page = page;
    this.executionId = executionId;
    this.pendingSignals = pendingSignals;
    this.executionsRepo = executionsRepo;
    this.log = log;
    this.timeoutMs = timeoutMs;
  }

  async esperarCodigo() {
    this.executionsRepo.actualizar(
      this.executionId,
      {
        estado: 'esperando_otp',
      }
    );

    this.log.info(
      'Esperando que el frontend envíe el código OTP...'
    );

    console.log(
      `[OTP-DEBUG] esperarCodigo esperando señal ${this.executionId}:otp`
    );

    const codigo =
      await this.pendingSignals.waitFor(
        `${this.executionId}:otp`,
        {
          timeoutMs: this.timeoutMs,
        }
      );

    if (!codigo) {
      throw new Error(
        'No se recibió un código OTP válido.'
      );
    }

    this.log.ok(
      'Código OTP recibido.'
    );

    return codigo;
  }
}

module.exports = OtpHandler;