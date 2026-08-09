package com.digout.models;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;

@Entity
@Table(name = "scan_history")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScanHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "product_name")
    private String productName;

    @Column(name = "raw_ocr_text", columnDefinition = "TEXT")
    private String rawOcrText;

    @Column(name = "who_assessment_json", columnDefinition = "JSON")
    @JdbcTypeCode(SqlTypes.JSON)
    private String whoAssessmentJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "health_status", columnDefinition = "ENUM('RED', 'YELLOW', 'GREEN')")
    private HealthStatus healthStatus;

    @Column(name = "scanned_at", updatable = false)
    @Builder.Default
    private LocalDateTime scannedAt = LocalDateTime.now();
}
