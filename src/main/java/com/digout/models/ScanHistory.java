package com.digout.models;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;

@Entity
@Table(name = "scan_history",
    indexes = {
        @Index(name = "idx_user_scanned_at", columnList = "user_id, scanned_at DESC")
    },
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_user_product", columnNames = {"user_id", "product_name"})
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScanHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User user;

    @Column(name = "product_name")
    private String productName;

    @Column(name = "raw_ocr_text", columnDefinition = "TEXT")
    @Convert(converter = com.digout.security.CryptoConverter.class)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private String rawOcrText;

    @Column(name = "who_assessment_json", columnDefinition = "JSON")
    @JdbcTypeCode(SqlTypes.JSON)
    private String whoAssessmentJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "health_status", length = 20)
    private HealthStatus healthStatus;

    @Column(name = "scanned_at", updatable = false)
    @Builder.Default
    private LocalDateTime scannedAt = LocalDateTime.now(java.time.ZoneOffset.UTC);
}
